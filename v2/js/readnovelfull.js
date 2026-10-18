/**
 * Source script for readnovelfull.com
 */
//@ts-check

/**
 * Normalizes a URL to be absolute with https and no double slashes in paths.
 * Returns empty string for invalid, non-navigable, or javascript URLs.
 * @param {string} url
 * @returns {string}
 */
function toAbsoluteUrl(url) {
    if (!url || typeof url !== "string") return "";
    let clean = url.trim();
    if (!clean || clean === "#" || clean === "https://" || clean === "http://" || clean.startsWith("javascript:") || clean.startsWith("mailto:") || clean.startsWith("data:")) {
        return "";
    }
    if (clean.startsWith("//")) {
        clean = `https:${clean}`;
    } else if (clean.startsWith("http://")) {
        clean = "https://" + clean.slice(7);
    } else if (clean.startsWith("readnovelfull.com")) {
        clean = `https://${clean}`;
    } else if (clean.startsWith("www.readnovelfull.com")) {
        clean = `https://${clean}`;
    } else if (!clean.startsWith("https://")) {
        clean = `https://readnovelfull.com${clean.startsWith("/") ? "" : "/"}${clean}`;
    }

    const match = clean.match(/^(https:\/\/[^/?#]+)([^?#]*)([\s\S]*)$/);
    if (match) {
        const origin = match[1];
        const pathname = match[2].replace(/\/+/g, "/");
        const rest = match[3];
        return origin + pathname + rest;
    }
    return clean;
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
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const searchUrl = `https://readnovelfull.com/novel-list/search?keyword=${encodeURIComponent(trimmed)}&page=${pageNum}`;

        let resp = await http.get(searchUrl);
        if ((!resp || resp.status !== 200) && (!resp || resp.status === 429 || resp.status >= 500)) {
            resp = await http.get(searchUrl);
        }

        const results = [];
        const seenLinks = new Set();
        if (resp && resp.status === 200 && resp.body) {
            const $ = parseHtml(resp.body);

            const items = $("#list-page .list-novel .row, .col-novel-main .list-novel .row, .list-novel .row");
            for (const item of items) {
                const titleA = item.first("h3.novel-title a, .novel-title a");
                if (!titleA) continue;

                let href = titleA.attr("href");
                if (!href) continue;

                let link = toAbsoluteUrl(href);
                if (!link || seenLinks.has(link)) continue;

                let title = titleA.attr("title")?.trim() || titleA.text().trim();
                if (!title) continue;

                const imgE = item.first("img.cover, img");
                let imgSrc = imgE ? (imgE.attr("src") || imgE.attr("data-src") || imgE.attr("data-original") || "") : "";
                if (imgSrc) {
                    imgSrc = toAbsoluteUrl(imgSrc);
                }

                seenLinks.add(link);
                results.push({ title, link, imgSrc });
            }
        }

        return results;
    },

    /**
     * Retrieve novel metadata and chapter list.
     * @param {string} novelUrl - Full URL or relative path to novel overview page.
     * @returns {Promise<{
     *   title: string,
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
        if (!novelUrl || !novelUrl.trim()) {
            throw new Error("novelUrl is required");
        }

        const cleanUrl = toAbsoluteUrl(novelUrl);
        if (!cleanUrl) {
            throw new Error("Invalid novelUrl: " + novelUrl);
        }
        const baseUrl = cleanUrl.split("?")[0].split("#")[0];

        let resp = await http.get(baseUrl);
        if ((!resp || resp.status !== 200) && (!resp || resp.status === 429 || resp.status >= 500)) {
            resp = await http.get(baseUrl);
        }
        if (!resp || resp.status !== 200 || !resp.body) {
            throw new Error(`Failed to load novel page: HTTP ${resp ? resp.status : "unknown"}`);
        }

        const $ = parseHtml(resp.body);

        // Title
        let title = $(".desc h3.title, h3.title[itemprop='name'], .books .desc h3.title, h3.title").first()?.text().trim() || "";
        if (!title) {
            const ogTitle = $("meta[property='og:title']").attr("content") || $("meta[name='title']").attr("content") || "";
            title = ogTitle
                .replace(/\s*novel\s+online\s+free.*$/i, "")
                .replace(/^Read\s+/i, "")
                .replace(/\s*-\s*ReadNovelFull.*$/i, "")
                .trim();
        }

        // Cover Image
        let imageUrl = $(".book img, .books .book img, .info-holder .book img, .books img").first()?.attr("src") ||
                       $(".book img, .books .book img, .info-holder .book img, .books img").first()?.attr("data-src") ||
                       $(".book img, .books .book img, .info-holder .book img, .books img").first()?.attr("data-original") || "";
        if (!imageUrl) {
            imageUrl = $("meta[name='image']").attr("content") || $("meta[property='og:image']").attr("content") || "";
        }
        if (imageUrl) {
            imageUrl = toAbsoluteUrl(imageUrl);
        }

        // Author
        let author = $(".info a[href*='/authors/'], .info-meta a[href*='/authors/'], .info a[href*='/author/'], .info-meta a[href*='/author/']")
            .map(a => a.text().trim()).filter(Boolean).join(", ");
        if (!author) {
            const authorSpan = $("span[itemprop='author'] meta[itemprop='name']").first()?.attr("content") || "";
            if (authorSpan) {
                author = authorSpan.trim();
            }
        }
        if (!author) {
            const infoItems = $(".info li, .info-meta li, .info div");
            for (const item of infoItems) {
                const t = item.text();
                if (/author:/i.test(t)) {
                    author = t.replace(/^Author:\s*/i, "").trim();
                    break;
                }
            }
        }
        if (!author) {
            const metaDesc = $("meta[name='description']").attr("content") || "";
            const m = metaDesc.match(/Author:\s*([^,.]+)/i);
            if (m) author = m[1].trim();
        }

        // Status
        let status = $(".info a[href*='/novel-list/'], .info-meta a[href*='/novel-list/']").first()?.text().trim() || "";
        if (!status) {
            const infoItems = $(".info li, .info-meta li, .info div");
            for (const item of infoItems) {
                const t = item.text();
                if (/status:/i.test(t)) {
                    status = t.replace(/^Status:\s*/i, "").trim();
                    break;
                }
            }
        }
        if (!status) {
            const infoText = $(".info, .info-meta").text();
            if (/completed/i.test(infoText)) {
                status = "Completed";
            } else if (/ongoing/i.test(infoText)) {
                status = "Ongoing";
            }
        }
        if (/completed/i.test(status)) {
            status = "Completed";
        } else if (/ongoing/i.test(status)) {
            status = "Ongoing";
        }

        // Genres
        const genreElements = $(".info a[href*='/genres/'], .info-meta a[href*='/genres/'], .info a[href*='/genre/'], .info-meta a[href*='/genre/']");
        const genres = Array.from(new Set(
            genreElements.map(el => el.text().trim()).filter(Boolean)
        )).join(", ");

        // Tags & Alternative names
        const tagElements = $(".info a[href*='/tags/'], .info-meta a[href*='/tags/'], .info a[href*='/tag/'], .info-meta a[href*='/tag/']");
        const tagsList = tagElements.map(el => el.text().trim()).filter(Boolean);
        const infoDivs = $(".info > div, .info div, .info-meta li");
        for (const div of infoDivs) {
            const t = div.text();
            if (/alternative names?:/i.test(t)) {
                const alt = t.replace(/^Alternative names?:\s*/i, "").trim();
                if (alt) tagsList.push(alt);
            }
        }
        const tags = Array.from(new Set(tagsList)).join(", ");

        // Description
        let description = "";
        const descEl = $(".desc-text").first();
        if (descEl) {
            descEl.remove("script, style, iframe, .ads, .ad, noscript");
            const pElements = descEl.select("p");
            if (pElements.length > 0) {
                description = pElements.map(p => p.text().trim()).filter(Boolean).join("\n\n");
            } else {
                const raw = descEl.html();
                if (raw) {
                    description = raw
                        .replace(/<br\s*\/?>/gi, "\n")
                        .replace(/<\/p>/gi, "\n\n")
                        .replace(/<[^>]+>/g, "")
                        .replace(/&nbsp;/gi, " ")
                        .replace(/&amp;/gi, "&")
                        .replace(/&lt;/gi, "<")
                        .replace(/&gt;/gi, ">")
                        .replace(/&quot;/gi, '"')
                        .replace(/&#39;/gi, "'")
                        .replace(/&#8217;/gi, "'")
                        .replace(/&#8230;/gi, "...")
                        .split("\n")
                        .map(line => line.trim())
                        .filter(Boolean)
                        .join("\n\n");
                } else {
                    description = descEl.text().trim();
                }
            }
        }
        if (!description) {
            description = ($("meta[name='description']").attr("content") || $("meta[property='og:description']").attr("content") || "").trim();
        }

        // Chapters
        const chapters = [];
        const seenChapterLinks = new Set();

        function addChapter(href, rawTitle) {
            if (!href) return;
            const link = toAbsoluteUrl(href);
            if (!link || seenChapterLinks.has(link) || link === baseUrl) return;
            // Exclude pagination and static navigation links
            if (/[?&]page=\d+/i.test(link)) return;
            if (/\/(?:novel-list|genres|authors|tags|search|privacy|terms|contact|login|register)(?:[/?#]|$)/i.test(link)) return;

            let chTitle = (rawTitle || "").trim();
            if (!chTitle) {
                const nameMatch = link.match(/\/(?:chapter|ch|c)[-_]?([^/?#.]+)/i);
                chTitle = nameMatch ? `Chapter ${nameMatch[1].replace(/[-_]/g, " ")}` : "Chapter";
            }

            seenChapterLinks.add(link);
            chapters.push({
                title: chTitle,
                link,
                text: ""
            });
        }

        // Extract novelId for chapter archive AJAX endpoint
        let rawNovelId = $("#rating").first()?.attr("data-novel-id") ||
                         $("[data-novel-id]").first()?.attr("data-novel-id") || "";
        if (!rawNovelId) {
            const idMatch = resp.body.match(/data-novel-id=["']?(\d+)["']?/i) ||
                            resp.body.match(/novelId\s*=\s*['"]?(\d+)['"]?/i);
            if (idMatch) rawNovelId = idMatch[1];
        }

        let novelId = "";
        if (rawNovelId) {
            const numMatch = String(rawNovelId).match(/\d+/);
            if (numMatch && numMatch[0] !== "0") {
                novelId = numMatch[0];
            }
        }

        if (novelId) {
            try {
                const ajaxUrl = `https://readnovelfull.com/ajax/chapter-archive?novelId=${novelId}`;
                let chResp = await http.get(ajaxUrl);
                if ((!chResp || chResp.status !== 200) && (!chResp || chResp.status === 429 || chResp.status >= 500)) {
                    chResp = await http.get(ajaxUrl);
                }

                if (chResp && chResp.status === 200 && chResp.body) {
                    const $ch = parseHtml(chResp.body);
                    let links = $ch("ul.list-chapter li a, .list-chapter li a, #chapter-archive a");
                    if (links.length === 0) {
                        links = $ch("a[href*='/chapter-'], a[href*='/ch-'], a[href*='/c-']");
                    }
                    for (const a of links) {
                        const href = a.attr("href");
                        if (!href || href === "#" || href.startsWith("javascript:")) continue;
                        const titleText = a.first(".nchr-text")?.text() || a.attr("title") || a.text();
                        addChapter(href, titleText);
                    }
                }
            } catch (e) {
                console.warn("Failed to fetch chapters via ajax/chapter-archive: " + e.message);
            }
        }

        // Fallback to inline HTML chapters if AJAX returned no chapters
        if (chapters.length === 0) {
            const links = $("#list-chapter ul.list-chapter li a, ul.list-chapter li a, .list-chapter li a");
            for (const a of links) {
                const href = a.attr("href");
                if (!href || href === "#" || href.startsWith("javascript:")) continue;
                const titleText = a.first(".nchr-text")?.text() || a.attr("title") || a.text();
                addChapter(href, titleText);
            }
        }

        return {
            title,
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
        if (!chapterUrl || !chapterUrl.trim()) return "";
        const url = toAbsoluteUrl(chapterUrl);
        if (!url) return "";

        let resp = await http.get(url);
        if ((!resp || resp.status !== 200) && (!resp || resp.status === 429 || resp.status >= 500)) {
            resp = await http.get(url);
        }
        if (!resp || resp.status !== 200 || !resp.body) {
            throw new Error(`Failed to load chapter page: HTTP ${resp ? resp.status : "unknown"}`);
        }
        const $ = parseHtml(resp.body);
        const content = $("#chr-content, .chr-c, #chapter-content, .chapter-c").first();
        if (!content) {
            return "";
        }
        // Clean any ad elements, iframes, scripts, noscript
        content.remove("iframe, script, style, .ads, .ad, noscript, div[align='center']");

        const pElements = content.select("p");
        let paragraphs = "";
        if (pElements.length > 0) {
            paragraphs = pElements.map(p => p.text().trim())
                .filter(text => text.length > 0)
                .map(p => `<p>${p}</p>`)
                .join("");
        }
        if (!paragraphs) {
            const raw = content.html();
            if (raw) {
                paragraphs = raw
                    .replace(/<br\s*\/?>/gi, "\n")
                    .replace(/<\/p>/gi, "\n\n")
                    .replace(/<[^>]+>/g, "")
                    .replace(/&nbsp;/gi, " ")
                    .replace(/&amp;/gi, "&")
                    .replace(/&lt;/gi, "<")
                    .replace(/&gt;/gi, ">")
                    .replace(/&quot;/gi, '"')
                    .replace(/&#39;/gi, "'")
                    .replace(/&#8217;/gi, "'")
                    .replace(/&#8230;/gi, "...")
                    .split("\n")
                    .map(line => line.trim())
                    .filter(Boolean)
                    .join("\n\n");
            } else {
                paragraphs = content.text().trim();
            }
        }

        return paragraphs;
    }
};
