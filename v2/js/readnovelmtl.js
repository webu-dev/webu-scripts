/**
 * Source script for readnovelmtl.com
 */
//@ts-check

/**
 * Normalizes a URL to be absolute with https and no duplicate path slashes.
 * @param {string} url
 * @returns {string}
 */
function toAbsoluteUrl(url) {
    if (!url || typeof url !== "string") return "";
    let clean = url.trim();
    if (!clean || clean.startsWith("#") || clean === "https://" || clean === "http://" ||
        clean.startsWith("javascript:") || clean.startsWith("mailto:") || clean.startsWith("data:") || clean.startsWith("tel:")) {
        return "";
    }
    if (clean.startsWith("//")) {
        clean = `https:${clean}`;
    } else if (clean.startsWith("http://")) {
        clean = "https://" + clean.slice(7);
    } else if (/^([a-z0-9-]+\.)*readnovelmtl\.com(\/|$)/i.test(clean)) {
        clean = `https://${clean}`;
    } else if (!clean.startsWith("https://")) {
        clean = `https://readnovelmtl.com${clean.startsWith("/") ? "" : "/"}${clean}`;
    }

    clean = clean.replace(/^https?:\/\/www\.readnovelmtl\.com(\/|$)/i, "https://readnovelmtl.com$1");

    const match = clean.match(/^(https:\/\/[^/?#]+)([^?#]*)([\s\S]*)$/);
    if (match) {
        const origin = match[1];
        const pathname = match[2].replace(/\/+/g, "/");
        const rest = match[3];
        return origin + pathname + rest;
    }
    return clean;
}

/**
 * Decodes standard and numeric HTML entities.
 * @param {string} str
 * @returns {string}
 */
function decodeHtmlEntities(str) {
    if (!str || typeof str !== "string") return "";
    return str
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&apos;/gi, "'")
        .replace(/&#039;/gi, "'")
        .replace(/&#x27;/gi, "'")
        .replace(/&lsquo;/gi, "‘")
        .replace(/&rsquo;/gi, "’")
        .replace(/&ldquo;/gi, "“")
        .replace(/&rdquo;/gi, "”")
        .replace(/&hellip;/gi, "...")
        .replace(/&mdash;/gi, "—")
        .replace(/&ndash;/gi, "–")
        .replace(/&#(\d+);/g, (_, dec) => {
            /* Convert number html code entities */
            try {
                const code = parseInt(dec, 10);
                return code ? String.fromCodePoint(code) : "";
            } catch (_) {
                return "";
            }
        })
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => {
            /* Convert hex html code entities */
            try {
                const code = parseInt(hex, 16);
                return code ? String.fromCodePoint(code) : "";
            } catch (_) {
                return "";
            }
        });
}

/**
 * Formats HTML text with paragraphs and breaks into clean plain text.
 * @param {string} html
 * @returns {string}
 */
function cleanDescription(html) {
    if (!html || typeof html !== "string") return "";
    const textWithBreaks = html
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<\/p>/gi, "\n\n")
        .replace(/<[^>]+>/g, "");
    return decodeHtmlEntities(textWithBreaks)
        .split("\n")
        .map(line => line.trim())
        .filter(Boolean)
        .join("\n\n");
}

const source = {
    /**
     * Search novels matching a query string.
     * @param {string} query - Search keyword.
     * @param {number} page - 1-based page index.
     * @returns {Promise<Array<{ title: string, link: string, imgSrc: string }>>}
     */
    async searchNovels(query, page = 1) {
        if (!query || !query.trim()) return [];

        const trimmed = query.trim();
        const p = Math.max(1, parseInt(page, 10) || 1);
        const searchUrl = `https://readnovelmtl.com/search-v3?search=${encodeURIComponent(trimmed)}&page=${p}`;

        let resp = await http.get(searchUrl);
        if ((!resp || resp.status !== 200) && (!resp || resp.status === 429 || resp.status >= 500)) {
            resp = await http.get(searchUrl);
        }

        if (resp && resp.body && (resp.body.includes("Just a moment...") || resp.body.includes("cf-turnstile"))) {
            throw new Error("ReadNovelMTL security check required: Cloudflare challenge triggered.");
        }

        if (!resp || resp.status !== 200 || !resp.body) {
            return [];
        }

        const $ = parseHtml(resp.body);
        let items = $(".novel-list");
        if (items.length === 1 && items[0].select("h2 a").length > 1) {
            items = items[0].select(".card, .row > div");
        } else if (items.length === 0) {
            items = $(".card:has(h2), .card");
        }

        const results = [];
        const seenLinks = new Set();

        for (const item of items) {
            const a = item.first("h2 a, .novel-title a, a[href*='/novel/']");
            if (!a) continue;

            const href = a.attr("href");
            if (!href) continue;

            const link = toAbsoluteUrl(href);
            if (!link || seenLinks.has(link)) continue;

            let title = a.text().trim();
            if (!title) {
                title = a.attr("title")?.trim() || "";
            }
            title = decodeHtmlEntities(title).trim();
            if (!title) continue;

            const img = item.first("img.object-fit-cover, img[src*='/uploads/cover/'], img");
            let imgSrc = "";
            if (img) {
                const dataSrc = img.attr("data-src")?.trim();
                const src = img.attr("src")?.trim();
                if (dataSrc && !dataSrc.includes("placeholder-")) {
                    imgSrc = toAbsoluteUrl(dataSrc);
                } else if (src && !src.includes("placeholder-")) {
                    imgSrc = toAbsoluteUrl(src);
                } else if (dataSrc) {
                    imgSrc = toAbsoluteUrl(dataSrc);
                } else if (src) {
                    imgSrc = toAbsoluteUrl(src);
                }
            }

            seenLinks.add(link);
            results.push({
                title,
                link,
                imgSrc
            });
        }

        return results;
    },

    /**
     * Retrieve novel metadata and chapter list.
     * @param {string} novelUrl - Full URL to novel overview page.
     * @returns {Promise<{
     *   title: string,
     *   altTitle?: string,
     *   imageUrl: string,
     *   description: string,
     *   author: string,
     *   genres: string,
     *   tags: string,
     *   status: string,
     *   chapters: Array<{ title: string, link: string, text: string }>
     * }>}
     */
    async getNovel(novelUrl) {
        if (!novelUrl || typeof novelUrl !== "string" || !novelUrl.trim() || novelUrl.trim() === "#") {
            throw new Error("Invalid novel URL");
        }

        const cleanUrl = toAbsoluteUrl(novelUrl.split("?")[0].split("#")[0]);
        if (!cleanUrl) {
            throw new Error("Invalid novel URL");
        }

        let resp = await http.get(cleanUrl);
        if ((!resp || resp.status !== 200) && (!resp || resp.status === 429 || resp.status >= 500)) {
            resp = await http.get(cleanUrl);
        }

        if (!resp || resp.status !== 200 || !resp.body) {
            if (resp && resp.body && (resp.body.includes("Just a moment...") || resp.body.includes("cf-turnstile"))) {
                throw new Error("ReadNovelMTL security check required: Cloudflare challenge triggered.");
            }
            throw new Error(`Failed to load novel page: HTTP ${resp ? resp.status : "unknown"}`);
        }

        if (resp.body.includes("Just a moment...") || resp.body.includes("cf-turnstile")) {
            throw new Error("ReadNovelMTL security check required: Cloudflare challenge triggered.");
        }

        const $ = parseHtml(resp.body);

        // Title
        const titleEl = $("h1").first();
        let title = titleEl ? titleEl.text().trim() : "";
        if (!title) {
            title = $("meta[property='og:title']").attr("content") || "";
            title = title.replace(/\s*\|\s*ReadNovelMTL$/i, "").trim();
        }
        title = decodeHtmlEntities(title).trim();

        // Alternative Title
        const altTitleEl = $("h1 + p.text-secondary, p.text-secondary").first();
        let altTitle = altTitleEl ? decodeHtmlEntities(altTitleEl.text().trim()) : "";

        // Author
        const authorEl = $("a[href*='/novel?author='], a[href*='author='], .author a, span[itemprop='author']").first();
        let author = authorEl ? authorEl.text().trim() : "";
        if (!author) {
            const authorMeta = $("meta[name='author']").attr("content") || "";
            if (authorMeta) author = authorMeta.trim();
        }
        author = author.replace(/^By\s+/i, "").trim();
        author = decodeHtmlEntities(author).trim();

        // Cover Image
        const coverImg = $(".card-body img[src*='/uploads/cover/'], img.object-fit-cover, .card-body img, img").first();
        let imageUrl = "";
        if (coverImg) {
            const dataSrc = coverImg.attr("data-src")?.trim();
            const src = coverImg.attr("src")?.trim();
            if (dataSrc && !dataSrc.includes("placeholder-")) {
                imageUrl = toAbsoluteUrl(dataSrc);
            } else if (src && !src.includes("placeholder-")) {
                imageUrl = toAbsoluteUrl(src);
            } else if (dataSrc) {
                imageUrl = toAbsoluteUrl(dataSrc);
            } else if (src) {
                imageUrl = toAbsoluteUrl(src);
            }
        }
        if (!imageUrl) {
            const ogImg = $("meta[property='og:image']").attr("content") || "";
            if (ogImg) imageUrl = toAbsoluteUrl(ogImg);
        }

        // Status
        let status = "Ongoing";
        const infoSpan = $("i.fa-info-circle + span, i.fa-info-circle ~ span, .d-flex:has(i.fa-info-circle), .d-flex:has(.fa-info-circle)").first();
        const infoText = infoSpan ? infoSpan.text().trim() : "";
        if (/Completed/i.test(infoText)) {
            status = "Completed";
        } else if (/Ongoing/i.test(infoText)) {
            status = "Ongoing";
        } else if (/Hiatus/i.test(infoText)) {
            status = "Hiatus";
        } else if (/Dropped/i.test(infoText)) {
            status = "Dropped";
        } else {
            const metaContainer = authorEl ? $(".card-body .mb-4:has(a[href*='author='])").first() : $(".card-body .mb-4").first();
            const metaText = metaContainer ? metaContainer.text() : "";
            if (/\bCompleted\b/i.test(metaText)) {
                status = "Completed";
            } else if (/\bOngoing\b/i.test(metaText)) {
                status = "Ongoing";
            } else if (/\bHiatus\b/i.test(metaText)) {
                status = "Hiatus";
            } else if (/\bDropped\b/i.test(metaText)) {
                status = "Dropped";
            }
        }

        // Genres & Categories (strictly scoped to .card-body to avoid navbar dropdown categories)
        const badgeElements = $(".card-body .badge, .card-body a[href^='/category/'], .card-body a[href*='/category/']");
        const genres = Array.from(new Set(
            badgeElements.map(el => decodeHtmlEntities(el.text().trim())).filter(Boolean)
        )).join(", ");

        const tags = altTitle ? altTitle : genres;

        // Synopsis / Description (hierarchical fallback avoiding altTitle or unrelated cards)
        let descParagraphs = $(".card-body div.mb-4[style*='font-size: 1rem'] p");
        if (descParagraphs.length === 0) {
            descParagraphs = $(".card-body div.mb-4:not(:has(a[href*='author='])) p");
        }
        if (descParagraphs.length === 0) {
            descParagraphs = $(".card-body p:not(.text-secondary)");
        }

        let description = "";
        if (descParagraphs.length > 0) {
            const pTexts = [];
            for (const p of descParagraphs) {
                const t = decodeHtmlEntities(p.text().trim());
                if (t && !t.startsWith("Author:") && !t.startsWith("Status:")) {
                    pTexts.push(t);
                }
            }
            description = pTexts.join("\n\n");
        }
        if (!description) {
            const descEl = $(".card-body div.mb-4[style*='font-size: 1rem'], .card-body div.mb-4:not(:has(a[href*='author=']))").first();
            if (descEl) {
                description = cleanDescription(descEl.html()) || descEl.text().trim();
            }
        }
        if (!description) {
            description = $("meta[name='description']").attr("content") || "";
        }
        description = decodeHtmlEntities(description).trim();

        // Chapters TOC from #chapter-chunk a or .accordion-body a
        const chapters = [];
        const seenChapterLinks = new Set();
        const chapterLinks = $("#chapter-chunk a, .accordion-body a, #chapters a");

        for (const a of chapterLinks) {
            const href = a.attr("href");
            if (!href) continue;

            const link = toAbsoluteUrl(href);
            if (!link || seenChapterLinks.has(link)) continue;
            if (!link.includes("/chapter/")) continue;
            seenChapterLinks.add(link);

            let chTitle = a.text().trim();
            if (!chTitle) {
                chTitle = a.attr("title")?.trim() || "";
            }
            chTitle = decodeHtmlEntities(chTitle).trim();
            if (!chTitle) {
                chTitle = `Chapter ${chapters.length + 1}`;
            }

            chapters.push({
                title: chTitle,
                link: link,
                text: ""
            });
        }

        return {
            title,
            altTitle,
            imageUrl,
            description,
            author,
            genres,
            tags,
            status,
            chapters
        };
    },

    /**
     * Retrieve text content for a single chapter.
     * @param {string} chapterUrl - Full URL or relative path to chapter reading page.
     * @returns {Promise<string>}
     */
    async getChapterText(chapterUrl) {
        /* Input validation */
        if (!chapterUrl || typeof chapterUrl !== "string" || !chapterUrl.trim()) throw new Error(`Failed to load valid chapter url=${chapterUrl}`);
        let cleanUrl = toAbsoluteUrl(chapterUrl.trim());
        if (!cleanUrl) throw new Error(`Failed to load valid chapter url=${chapterUrl}`);

        /* Network request with retry and backoff on 429 is handled in HttpBridge */
        let resp = await http.get(cleanUrl);
        if ((!resp || resp.status !== 200) && (!resp || resp.status === 429 || resp.status >= 500)) {
            resp = await http.get(cleanUrl);
        }

        if (!resp || resp.status !== 200 || !resp.body) {
            if (resp && resp.body && (resp.body.includes("Just a moment...") || resp.body.includes("cf-turnstile"))) {
                throw new Error("ReadNovelMTL security check required: Cloudflare challenge triggered.");
            }
            throw new Error(`Failed to load chapter page: HTTP ${resp ? resp.status : "unknown"}`);
        }

        if (resp.body.includes("Just a moment...") || resp.body.includes("cf-turnstile")) {
            throw new Error("ReadNovelMTL security check required: Cloudflare challenge triggered.");
        }

        const $ = parseHtml(resp.body);
        const container = $("#content, article#chapter-article, div.chapter-content, article").first();
        if (!container) {
            throw new Error(`Failed to load chapter container`);
        }

        const pElements = $("#content p, .chapter-content p, article p");
        if (pElements.length > 0) {
            const paragraphs = pElements.map(p => decodeHtmlEntities(p.text().trim()))
                .filter(text => text.length > 0)
                .filter(text => !/continue\s+read(?:ing)?\s+on\s+readnovelmtl\.com/gi.test(text))
                .map(p => `<p>${p}</p>`)
                .join("");
            return paragraphs;
        }
        throw new Error(`Failed to load chapter paragraphs`);
    }
};
