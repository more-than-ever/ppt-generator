import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { validateDeck, validId, contentFields } from "../shared/deck.js";
export const error = (status, message) =>
  Object.assign(new Error(message), { status });
export class LocalStore {
  constructor(root) {
    this.root = root;
    this.locks = new Map();
  }
  async init() {
    await Promise.all(
      ["decks", "assets", "tasks"].map((p) =>
        fs.mkdir(path.join(this.root, p), { recursive: true }),
      ),
    );
    return this;
  }
  file(kind, id) {
    if (!validId(id)) throw error(400, "标识不合法");
    return path.join(this.root, kind, `${id}.json`);
  }
  serial(id, fn) {
    const previous = this.locks.get(id) || Promise.resolve();
    const work = previous.catch(() => {}).then(fn);
    this.locks.set(id, work);
    work
      .finally(() => {
        if (this.locks.get(id) === work) this.locks.delete(id);
      })
      .catch(() => {});
    return work;
  }
  async read(file, optional = false) {
    let damaged = false;
    for (const name of [file, `${file}.bak`]) {
      try {
        const value = JSON.parse(await fs.readFile(name, "utf8"));
        if (!value || typeof value !== "object" || Array.isArray(value))
          throw new SyntaxError("存储对象不合法");
        return value;
      } catch (e) {
        if (e instanceof SyntaxError) damaged = true;
        else if (e.code !== "ENOENT") throw e;
      }
    }
    if (damaged)
      throw error(
        422,
        "主文件及备份均不可读，已阻止覆盖，请保留文件并恢复备份",
      );
    if (optional) return null;
    throw error(404, "文稿或资产不存在");
  }
  async atomic(file, value) {
    const tmp = `${file}.${randomUUID()}.tmp`;
    const handle = await fs.open(tmp, "wx");
    try {
      await handle.writeFile(JSON.stringify(value));
      await handle.sync();
    } finally {
      await handle.close();
    }
    // 最近可读版本备份与新快照分别原子替换；损坏主文件不污染备份。
    try {
      const prior = await fs.readFile(file, "utf8");
      JSON.parse(prior);
      const backup = `${file}.bak.tmp`;
      await fs.writeFile(backup, prior);
      await fs.rename(backup, `${file}.bak`);
    } catch (e) {
      if (e.code !== "ENOENT" && !(e instanceof SyntaxError)) throw e;
    }
    await fs.rename(tmp, file);
  }
  async load(id) {
    const data = await this.read(this.file("decks", id));
    if (data.deleted) throw error(404, "文稿已删除");
    return data;
  }
  async assetsFor(deck) {
    const result = {};
    for (const id of new Set(
      deck.slides.flatMap((s) => [
        ...s.assets.map((a) => a.id),
        ...(s.legacyImageUrl ? [s.legacyImageUrl.split("/").at(-1)] : []),
        ...(s.aiImage ? [s.aiImage.assetId] : []),
        ...(s.inlineImages || []).map((i) => i.assetId),
      ]),
    )) {
      const asset = await this.read(this.file("assets", id), true);
      if (asset)
        result[id] = {
          id,
          mime: asset.mime,
          name: asset.name,
          url: `/api/assets/${id}`,
        };
    }
    return result;
  }
  async get(id) {
    const { deck } = await this.load(id);
    return { deck, assets: await this.assetsFor(deck) };
  }
  async list() {
    const rows = [];
    for (const file of await fs.readdir(path.join(this.root, "decks"))) {
      if (!file.endsWith(".json")) continue;
      try {
        const { deck, deleted } = await this.read(
          this.file("decks", file.slice(0, -5)),
        );
        if (!deleted)
          rows.push({
            id: deck.id,
            title: deck.title,
            pages: deck.slides.length,
            revision: deck.revision,
            updatedAt: deck.updatedAt,
          });
      } catch {
        rows.push({
          id: file.slice(0, -5),
          unreadable: true,
          title: "文稿无法读取",
          pages: 0,
        });
      }
    }
    return rows.sort((a, b) =>
      (b.updatedAt || "").localeCompare(a.updatedAt || ""),
    );
  }
  async save(input, expectedRevision) {
    const deck = validateDeck(input);
    return this.serial(deck.id, async () => {
      const file = this.file("decks", deck.id),
        old = await this.read(file, true);
      if (old?.deleted || expectedRevision !== (old?.deck.revision || 0))
        throw error(
          409,
          "此文稿已被其他窗口修改或删除。请先备份未保存内容，再重新打开。",
        );
      if (old) validateDeck(old.deck);
      let contentChanged = false;
      for (const s of deck.slides) {
        const prior = old?.deck.slides.find((p) => p.id === s.id);
        if (
          prior &&
          contentFields.some(
            (k) => JSON.stringify(prior[k]) !== JSON.stringify(s[k]),
          )
        ) {
          contentChanged = true;
          s.contentRevision = Math.max(
            s.contentRevision,
            prior.contentRevision + 1,
          );
        } else if (prior) {
          s.contentRevision = Math.max(
            s.contentRevision,
            prior.contentRevision,
          );
        }
      }
      for (const key of ["review", "generationReview"]) {
        if (
          deck[key] &&
          (deck.slides.some(
            (s) => deck[key].revisions[s.id] !== s.contentRevision,
          ) ||
            (old &&
              (contentChanged ||
                JSON.stringify(deck.sources) !==
                  JSON.stringify(old.deck.sources)) &&
              JSON.stringify(deck[key]) === JSON.stringify(old.deck[key])))
        ) {
          deck[key] = null;
        }
      }
      deck.revision = (old?.deck.revision || 0) + 1;
      deck.updatedAt = new Date().toISOString();
      const versions = old
        ? [...(old.versions || []), old.deck].slice(-20)
        : [];
      await this.atomic(file, { deck, versions });
      return { deck, assets: await this.assetsFor(deck) };
    });
  }
  async remove(id, expectedRevision) {
    return this.serial(id, async () => {
      const old = await this.load(id);
      if (old.deck.revision !== expectedRevision)
        throw error(409, "删除前文稿已变化，请刷新");
      await this.atomic(this.file("decks", id), { ...old, deleted: true });
    });
  }
  async copy(id) {
    const { deck } = await this.load(id);
    return this.save(
      {
        ...deck,
        id: randomUUID(),
        revision: 0,
        title: `${deck.title.slice(0, 197)} 副本`,
        review: null,
      },
      0,
    );
  }
  async versions(id) {
    const { versions } = await this.load(id);
    return versions
      .map((d) => ({
        revision: d.revision,
        updatedAt: d.updatedAt,
        title: d.title,
      }))
      .reverse();
  }
  async restore(id, revision, expectedRevision) {
    const { deck, versions } = await this.load(id),
      chosen = versions.find((d) => d.revision === revision);
    if (!chosen) throw error(404, "该版本已不在最近20次记录中");
    const next = {
      ...chosen,
      review: null,
      slides: chosen.slides.map((s) => ({
        ...s,
        contentRevision:
          Math.max(
            s.contentRevision,
            deck.slides.find((p) => p.id === s.id)?.contentRevision || 0,
          ) + 1,
      })),
    };
    return this.save(next, expectedRevision);
  }
  decodeImage(dataUrl) {
    const match =
      /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+=*)$/.exec(
        dataUrl || "",
      );
    if (!match) throw error(400, "仅支持PNG、JPEG、WebP图片数据");
    const bytes = Buffer.from(match[2], "base64");
    if (bytes.length > 10 * 1024 * 1024 || bytes.length < 12)
      throw error(413, "单张图片须在10MB以内且内容有效");
    const valid =
      match[1] === "png"
        ? bytes
            .subarray(0, 8)
            .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : match[1] === "jpeg"
          ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
          : bytes.toString("ascii", 0, 4) === "RIFF" &&
            bytes.toString("ascii", 8, 12) === "WEBP";
    if (!valid) throw error(400, "图片签名与类型不一致");
    return { bytes, mime: `image/${match[1]}`, dataUrl };
  }
  async putAsset(dataUrl, name = "配图") {
    const { bytes, mime } = this.decodeImage(dataUrl),
      id = createHash("sha256").update(bytes).digest("hex");
    await this.serial(`asset-${id}`, () =>
      this.atomic(this.file("assets", id), {
        id,
        mime,
        name: String(name).slice(0, 200),
        dataUrl,
      }),
    );
    return {
      id,
      mime,
      name: String(name).slice(0, 200),
      url: `/api/assets/${id}`,
    };
  }
  async backup(deck) {
    const clean = validateDeck(deck),
      assets = {};
    for (const id of Object.keys(await this.assetsFor(clean)))
      assets[id] = await this.read(this.file("assets", id));
    const expected = new Set(
      clean.slides.flatMap((s) => [
        ...s.assets.map((a) => a.id),
        ...(s.legacyImageUrl ? [s.legacyImageUrl.split("/").at(-1)] : []),
        ...(s.aiImage ? [s.aiImage.assetId] : []),
        ...(s.inlineImages || []).map((i) => i.assetId),
      ]),
    );
    if ([...expected].some((id) => !assets[id]))
      throw error(422, "资产缺失，无法生成完整备份");
    const backup = {
      format: "slideflow",
      schemaVersion: 1,
      deck: clean,
      assets,
    };
    if (Buffer.byteLength(JSON.stringify(backup)) > 100 * 1024 * 1024)
      throw error(413, "备份超过100MB");
    return backup;
  }
  async importBackup(raw) {
    if (
      raw?.format !== "slideflow" ||
      raw.schemaVersion !== 1 ||
      Buffer.byteLength(JSON.stringify(raw)) > 100 * 1024 * 1024
    )
      throw error(400, "备份版本或大小不合法");
    const deck = validateDeck(raw.deck),
      assetMap = {};
    const refs = new Set(
      deck.slides.flatMap((s) => [
        ...s.assets.map((a) => a.id),
        ...(s.legacyImageUrl ? [s.legacyImageUrl.split("/").at(-1)] : []),
      ]),
    );
    for (const id of refs) {
      if (!raw.assets?.[id]) throw error(400, "备份缺少图片");
      this.decodeImage(raw.assets[id].dataUrl);
    }
    for (const id of refs)
      assetMap[id] = await this.putAsset(
        raw.assets[id].dataUrl,
        raw.assets[id].name,
      );
    deck.slides.forEach((s) => {
      s.assets = s.assets.map((a) => ({ ...a, id: assetMap[a.id].id }));
      if (s.legacyImageUrl)
        s.legacyImageUrl = `/api/assets/${assetMap[s.legacyImageUrl.split("/").at(-1)].id}`;
    });
    deck.id = randomUUID();
    deck.revision = 0;
    deck.review = null;
    return this.save(deck, 0);
  }
}
