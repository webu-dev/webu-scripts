/**
 * Source script for wtr-lab.com
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
    if (!clean || clean === "#" || clean.startsWith("javascript:") || clean.startsWith("mailto:") || clean.startsWith("data:")) {
        return "";
    }
    if (clean.startsWith("//")) {
        clean = `https:${clean}`;
    } else if (clean.startsWith("http://")) {
        clean = "https://" + clean.slice(7);
    } else if (clean.startsWith("wtr-lab.com") || clean.startsWith("img.wtr-lab.com")) {
        clean = `https://${clean}`;
    } else if (!clean.startsWith("https://")) {
        clean = `https://wtr-lab.com${clean.startsWith("/") ? "" : "/"}${clean}`;
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

/**
 * Decodes standard HTML entities.
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
 * Decodes WTR-LAB macro tokens such as %{Soul Land|RG91bHVv} to "Soul Land".
 * @param {string} text
 * @returns {string}
 */
function cleanMacroText(text) {
    if (!text || typeof text !== "string") return "";
    return text.replace(/%\{([^|}]+)(?:\|[^}]*)?\}/g, "$1").trim();
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

        const results = [];
        const seenLinks = new Set();

        // 1. Primary for page 1: POST /api/search with JSON payload
        // NOTE: /api/search is an instant search popup endpoint that ignores page parameter
        // and returns only top 10 matches. For page > 1, query novel-finder directly for true pagination.
        if (p === 1) {
            try {
                const searchApiUrl = "https://wtr-lab.com/api/search";
                let resp = await http.post(searchApiUrl, { text: trimmed }, { "Referer": "https://wtr-lab.com/en/novel-finder" });
                if ((!resp || resp.status !== 200) && (!resp || resp.status === 429 || resp.status >= 500)) {
                    resp = await http.post(searchApiUrl, { text: trimmed }, { "Referer": "https://wtr-lab.com/en/novel-finder" });
                }

                if (resp && resp.status === 200 && resp.body) {
                    const parsed = JSON.parse(resp.body);
                    const items = Array.isArray(parsed) ? parsed : (parsed.data || []);
                    for (const item of items) {
                        const rawId = item.raw_id || item.id;
                        if (!rawId) continue;
                        const slug = item.slug || "_";
                        const itemData = item.data || {};
                        const rawTitle = itemData.title || item.title || "";
                        const title = cleanMacroText(decodeHtmlEntities(rawTitle));
                        if (!title) continue;

                        const rawImg = itemData.image || item.image || "";
                        const imgSrc = rawImg ? toAbsoluteUrl(rawImg) : "";
                        const link = `https://wtr-lab.com/en/novel/${rawId}/${slug}`;

                        if (!seenLinks.has(link)) {
                            seenLinks.add(link);
                            results.push({ title, link, imgSrc });
                        }
                    }
                }
            } catch (e) {
                console.warn("WTR-LAB search API error: " + e.message);
            }
        }

        // 2. Query novel-finder for page > 1 or when page 1 returned no results
        if (results.length === 0) {
            try {
                const finderUrl = `https://wtr-lab.com/en/novel-finder?text=${encodeURIComponent(trimmed)}&page=${p}`;
                let resp = await http.get(finderUrl);
                if ((!resp || resp.status !== 200) && (!resp || resp.status === 429 || resp.status >= 500)) {
                    resp = await http.get(finderUrl);
                }

                if (resp && resp.status === 200 && resp.body) {
                    const nextMatch = resp.body.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
                    if (nextMatch) {
                        try {
                            const nextJson = JSON.parse(nextMatch[1]);
                            const seriesObj = nextJson.props?.pageProps?.series;
                            const seriesList = Array.isArray(seriesObj) ? seriesObj : (seriesObj?.data || []);
                            for (const item of seriesList) {
                                const rawId = item.raw_id || item.id;
                                if (!rawId) continue;
                                const slug = item.slug || "_";
                                const itemData = item.data || {};
                                const rawTitle = itemData.title || item.title || "";
                                const title = cleanMacroText(decodeHtmlEntities(rawTitle));
                                if (!title) continue;

                                const rawImg = itemData.image || item.image || "";
                                const imgSrc = rawImg ? toAbsoluteUrl(rawImg) : "";
                                const link = `https://wtr-lab.com/en/novel/${rawId}/${slug}`;

                                if (!seenLinks.has(link)) {
                                    seenLinks.add(link);
                                    results.push({ title, link, imgSrc });
                                }
                            }
                        } catch (err) {
                            console.warn("WTR-LAB finder NEXT_DATA parsing error: " + err.message);
                        }
                    }

                    if (results.length === 0) {
                        const $ = parseHtml(resp.body);
                        const cards = $("a[href*='/novel/']");
                        for (const a of cards) {
                            const href = a.attr("href");
                            if (!href || href.includes("/continue")) continue;
                            const link = toAbsoluteUrl(href);
                            if (!link || seenLinks.has(link)) continue;

                            const title = cleanMacroText(decodeHtmlEntities(a.attr("title") || a.text().trim()));
                            if (!title) continue;

                            const imgEl = a.first("img");
                            const imgSrc = imgEl ? toAbsoluteUrl(imgEl.attr("src") || imgEl.attr("data-src") || "") : "";

                            seenLinks.add(link);
                            results.push({ title, link, imgSrc });
                        }
                    }
                }
            } catch (e) {
                console.warn("WTR-LAB novel-finder fallback error: " + e.message);
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

        let cleanUrl = toAbsoluteUrl(novelUrl);
        if (!cleanUrl) {
            throw new Error("Invalid novelUrl: " + novelUrl);
        }

        const urlMatch = cleanUrl.match(/\/novel\/(\d+)(?:\/([^/?#]+))?/i);
        let rawId = urlMatch ? parseInt(urlMatch[1], 10) : 0;
        let slug = urlMatch && urlMatch[2] ? urlMatch[2] : "";

        // If URL has no slug, Next.js returns 404 for /novel/{id}.
        // Using /novel/{id}/_ causes Next.js to redirect (307) to the canonical slug.
        if (rawId && (!slug || slug === "_")) {
            cleanUrl = `https://wtr-lab.com/en/novel/${rawId}/_`;
        }

        let resp = await http.get(cleanUrl);
        if ((!resp || resp.status !== 200) && (!resp || resp.status === 429 || resp.status >= 500)) {
            resp = await http.get(cleanUrl);
        }
        if (!resp || resp.status !== 200 || !resp.body) {
            throw new Error(`Failed to load novel page: HTTP ${resp ? resp.status : "unknown"}`);
        }

        let title = "";
        let imageUrl = "";
        let description = "";
        let author = "";
        let genres = "";
        let tags = "";
        let status = "Ongoing";
        let chapterCount = 0;

        // Extract from __NEXT_DATA__
        const nextMatch = resp.body.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
        if (nextMatch) {
            try {
                const nextData = JSON.parse(nextMatch[1]);
                const pageProps = nextData.props?.pageProps || {};
                const serie = pageProps.serie || {};
                const serieData = serie.serie_data || {};
                const dataObj = serieData.data || {};

                title = cleanMacroText(decodeHtmlEntities(dataObj.title || serieData.title || ""));
                author = cleanMacroText(decodeHtmlEntities(dataObj.author || serieData.author || ""));
                imageUrl = toAbsoluteUrl(dataObj.image || serieData.image || "");
                description = cleanMacroText(decodeHtmlEntities(dataObj.description || serieData.description || ""));

                const rawStatus = serieData.status !== undefined ? serieData.status : serieData.raw_status;
                status = (rawStatus === 1) ? "Completed" : "Ongoing";

                chapterCount = serieData.chapter_count || serieData.raw_chapter_count || 0;
                if (!rawId && serieData.raw_id) rawId = serieData.raw_id;
                if ((!slug || slug === "_") && serieData.slug) slug = serieData.slug;

                if (Array.isArray(pageProps.tags)) {
                    tags = pageProps.tags
                        .map(t => cleanMacroText(decodeHtmlEntities(t.title || t.name || "")))
                        .filter(Boolean)
                        .join(", ");
                }
                // Map tags to genres so TinyScrap's UI renders them in the Genres section
                genres = tags;
            } catch (e) {
                console.warn("WTR-LAB parse NEXT_DATA error: " + e.message);
            }
        }

        // HTML DOM fallback for metadata if needed
        if (!title || !description || !author) {
            const $ = parseHtml(resp.body);
            if (!title) {
                const h1Text = $("h1").first()?.text() || "";
                if (h1Text) {
                    title = cleanMacroText(decodeHtmlEntities(h1Text));
                } else {
                    const ogTitle = $("meta[property='og:title']").attr("content") || "";
                    title = cleanMacroText(decodeHtmlEntities(ogTitle.replace(/^Read\s+/i, "").replace(/\s*-\s*WTR-LAB.*$/i, "")));
                }
            }
            if (!imageUrl) {
                const ogImg = $("meta[property='og:image']").attr("content") || $("meta[name='image']").attr("content") || "";
                if (ogImg) imageUrl = toAbsoluteUrl(ogImg);
            }
            if (!author) {
                author = cleanMacroText(decodeHtmlEntities($(".author, [itemprop='author']").first()?.text() || ""));
            }
            if (!description) {
                const descEl = $(".description, .synopsis, [itemprop='description']").first();
                description = descEl ? cleanMacroText(decodeHtmlEntities(descEl.text())) : ($("meta[name='description']").attr("content") || "");
            }
        }

        // Chapters
        const chapters = [];
        const seenChapterLinks = new Set();
        const effectiveSlug = (slug && slug !== "_") ? slug : "_";

        if (rawId) {
            const endCount = Math.max(chapterCount || 0, 5000);
            const chaptersApiUrl = `https://wtr-lab.com/api/chapters/${rawId}?start=1&end=${endCount}`;

            try {
                let chResp = await http.get(chaptersApiUrl, { "Accept": "application/json, text/plain, */*", "Referer": cleanUrl });
                if ((!chResp || chResp.status !== 200) && (!chResp || chResp.status === 429 || chResp.status >= 500)) {
                    chResp = await http.get(chaptersApiUrl, { "Accept": "application/json, text/plain, */*", "Referer": cleanUrl });
                }

                if (chResp && chResp.status === 200 && chResp.body) {
                    const parsed = JSON.parse(chResp.body);
                    const chapterList = Array.isArray(parsed) ? parsed : (parsed.chapters || []);
                    // Ensure sorted by order
                    chapterList.sort((a, b) => (parseFloat(a.order) || 0) - (parseFloat(b.order) || 0));

                    for (const ch of chapterList) {
                        const order = ch.order;
                        if (order === undefined || order === null) continue;
                        const chTitle = cleanMacroText(decodeHtmlEntities(ch.title || `Chapter ${order}`));
                        const chLink = `https://wtr-lab.com/en/novel/${rawId}/${effectiveSlug}/chapter-${order}`;

                        if (!seenChapterLinks.has(chLink)) {
                            seenChapterLinks.add(chLink);
                            chapters.push({
                                title: chTitle,
                                link: chLink,
                                text: ""
                            });
                        }
                    }
                }
            } catch (e) {
                console.warn("WTR-LAB fetch chapters API error: " + e.message);
            }
        }

        // DOM fallback for chapters if API failed
        if (chapters.length === 0) {
            const $ = parseHtml(resp.body);
            const chAnchors = $("a[href*='/chapter-']");
            for (const a of chAnchors) {
                const href = a.attr("href");
                if (!href) continue;
                const link = toAbsoluteUrl(href);
                if (!link || seenChapterLinks.has(link)) continue;

                const chTitle = cleanMacroText(decodeHtmlEntities(a.attr("title") || a.text().trim() || "Chapter"));
                seenChapterLinks.add(link);
                chapters.push({
                    title: chTitle,
                    link,
                    text: ""
                });
            }
            chapters.sort((a, b) => {
                const ma = a.link.match(/\/chapter-([\d.]+)/);
                const mb = b.link.match(/\/chapter-([\d.]+)/);
                const na = ma ? parseFloat(ma[1]) : 0;
                const nb = mb ? parseFloat(mb[1]) : 0;
                return na - nb;
            });
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
        const cleanUrl = toAbsoluteUrl(chapterUrl);
        if (!cleanUrl) return "";

        let rawId = 0;
        /** @type {number | null} */
        let chapterNo = null;

        const urlMatch = cleanUrl.match(/\/novel\/(\d+)(?:\/[^/?#]+)*\/chapter-([\d.]+)/i);
        if (urlMatch) {
            rawId = parseInt(urlMatch[1], 10);
            chapterNo = parseFloat(urlMatch[2]);
        }

        // If not extractable from URL, fetch chapter page HTML to extract raw_id and order
        if (!rawId || chapterNo === null || isNaN(chapterNo)) {
            let pageResp = await http.get(cleanUrl);
            if ((!pageResp || pageResp.status !== 200) && (!pageResp || pageResp.status === 429 || pageResp.status >= 500)) {
                pageResp = await http.get(cleanUrl);
            }
            if (pageResp && pageResp.status === 200 && pageResp.body) {
                const nextMatch = pageResp.body.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
                if (nextMatch) {
                    try {
                        const nextData = JSON.parse(nextMatch[1]);
                        const ch = nextData.props?.pageProps?.serie?.chapter;
                        if (ch) {
                            rawId = ch.raw_id || ch.serie_id || 0;
                            if (ch.order !== undefined && ch.order !== null) {
                                chapterNo = typeof ch.order === "number" ? ch.order : parseFloat(ch.order);
                            }
                        }
                    } catch (e) {
                        console.warn("WTR-LAB parse chapter NEXT_DATA error: " + e.message);
                    }
                }
            }
        }

        if (!rawId || chapterNo === null || isNaN(chapterNo)) {
            throw new Error("Could not determine novel ID and chapter number from: " + chapterUrl);
        }

        // Step 1: POST /api/reader/get
        const readerPayload = {
            translate: "ai",
            language: "en",
            raw_id: rawId,
            chapter_no: chapterNo
        };

        let readerResp = await http.post("https://wtr-lab.com/api/reader/get", readerPayload, { "Referer": cleanUrl });
        if ((!readerResp || readerResp.status !== 200) && (!readerResp || readerResp.status === 429 || readerResp.status >= 500)) {
            readerResp = await http.post("https://wtr-lab.com/api/reader/get", readerPayload, { "Referer": cleanUrl });
        }

        if (!readerResp || readerResp.status !== 200 || !readerResp.body) {
            throw new Error(`Failed to request chapter reader: HTTP ${readerResp ? readerResp.status : "unknown"}`);
        }

        let readerJson;
        try {
            readerJson = JSON.parse(readerResp.body);
        } catch (e) {
            if (readerResp.body && (readerResp.body.includes("Just a moment...") || readerResp.body.includes("challenge-running") || readerResp.body.includes("cf-turnstile"))) {
                throw new Error("WTR-LAB security check required: Cloudflare Turnstile challenge triggered. Complete verification at https://wtr-lab.com/profile/challenge");
            }
            throw new Error(`Failed to parse chapter reader response (status ${readerResp.status}): ${e.message}`);
        }

        if (!readerJson.success) {
            if (readerJson.requireTurnstile) {
                throw new Error("WTR-LAB security check required: Cloudflare Turnstile challenge triggered. Complete verification at https://wtr-lab.com/profile/challenge");
            }
            throw new Error(`Failed to load chapter: ${readerJson.error || readerJson.message || "Unknown error"}`);
        }

        const contentUrl = readerJson.content_url;
        if (!contentUrl) {
            throw new Error("No content_url returned by reader API");
        }

        const fullContentUrl = contentUrl.startsWith("http") ? contentUrl : `https://wtr-lab.com${contentUrl}`;

        // Step 2: GET content_url
        let contentResp = await http.get(fullContentUrl, { "Accept": "application/json, text/plain, */*", "Referer": cleanUrl });
        if ((!contentResp || contentResp.status !== 200) && (!contentResp || contentResp.status === 429 || contentResp.status >= 500)) {
            contentResp = await http.get(fullContentUrl, { "Accept": "application/json, text/plain, */*", "Referer": cleanUrl });
        }

        if (!contentResp || contentResp.status !== 200 || !contentResp.body) {
            throw new Error(`Failed to fetch chapter content: HTTP ${contentResp ? contentResp.status : "unknown"}`);
        }

        let contentJson;
        try {
            contentJson = JSON.parse(contentResp.body);
        } catch (e) {
            throw new Error(`Failed to parse chapter content response (status ${contentResp.status}): ${e.message}`);
        }

        const dataObj = contentJson.data?.data || contentJson.data || {};
        const rawBody = dataObj.body || [];
        const terms = dataObj.glossary_data?.terms || [];

        const bodyArray = Array.isArray(rawBody) ? rawBody : (typeof rawBody === "string" ? [rawBody] : []);

        const cleanedParagraphs = bodyArray.map(p => {
            if (!p || typeof p !== "string") return "";
            // Remove model control tags
            let text = p.replace(/\[part:[^\]]*\]/gi, "").replace(/\[image[^\]]*\]/gi, "");
            text = decodeHtmlEntities(text);
            text = cleanMacroText(text);

            // Replace glossary placeholders: ※{index}[⛬〓]
            text = text.replace(/※(\d+)[⛬〓]?/g, (match, idx) => {
                const i = parseInt(idx, 10);
                if (terms && terms[i]) {
                    const termEntry = terms[i];
                    const term = Array.isArray(termEntry)
                        ? termEntry[0]
                        : (typeof termEntry === "string" ? termEntry : (termEntry?.target || termEntry?.en || ""));
                    if (term != null && term !== "") {
                        return cleanMacroText(decodeHtmlEntities(String(term)));
                    }
                }
                return match;
            });

            text = decodeHtmlEntities(text);
            text = cleanMacroText(text);
            return text.trim();
        }).filter(t => t.length > 0);

        return cleanedParagraphs.map(p => `<p>${p}</p>`).join("");
    }
};
