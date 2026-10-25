/**
 * Source script for novgo.net
 */
//@ts-check

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
 * Normalizes a URL to be absolute with https and no double slashes in paths.
 * Returns empty string for invalid, non-navigable, or javascript URLs.
 * @param {string} url
 * @returns {string}
 */
function toAbsoluteUrl(url) {
    if (!url || typeof url !== "string") return "";
    let clean = decodeHtmlEntities(url).trim();
    if (!clean || clean === "#" || clean.startsWith("javascript:") || clean.startsWith("mailto:") || clean.startsWith("data:")) {
        return "";
    }
    if (clean.startsWith("//")) {
        clean = `https:${clean}`;
    } else if (clean.startsWith("http://")) {
        clean = "https://" + clean.slice(7);
    } else if (clean.startsWith("novgo.net")) {
        clean = `https://${clean}`;
    } else if (!clean.startsWith("https://")) {
        clean = `https://novgo.net${clean.startsWith("/") ? "" : "/"}${clean}`;
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
 * Set of reserved root paths and system endpoints that cannot be novel slugs.
 */
const RESERVED_SLUGS = new Set([
    "search", "genre", "author", "login", "register", "about", "contact",
    "dmca", "privacy", "tos", "latest-release-novel", "top-novel", "hot-novel",
    "completed-novel", "new-novel", "most-popular", "latest", "auth", "web",
    "uploads", "ajax-search", "ajax-chapter-option", "ajax-chapter-list",
    "ajax-novel-rate", "ajax-report-chapter", "ajax-user-settings",
    "ajax-history-sync", "ajax-history-clear", "ajax-comment-create",
    "ajax-comment-update", "ajax-comment-delete", "ajax-comment-like",
    "ajax-comment-list", "ajax-library-toggle", "ajax-library-check",
    "sitemap.xml", "sitemap", "robots.txt", "favicon.ico"
]);

/**
 * Extracts novel slug identifier from a URL or raw slug string.
 * Supports novel overview URLs ({slug}.html), chapter reading URLs ({slug}/{chapter}.html),
 * and bare slugs.
 * @param {string} url
 * @returns {string}
 */
function extractSlug(url) {
    if (!url || typeof url !== "string") return "";
    let clean = url.trim().split("?")[0].split("#")[0];
    clean = clean.replace(/^https?:\/\/(?:www\.)?novgo\.net\/?/i, "");
    clean = clean.replace(/^\/+/, "").replace(/\/+$/, "");
    if (!clean) return "";

    // If chapter URL format: {slug}/{chapter-name}.html (e.g. status-sheet-mc.html or chapter-1.html)
    const chapterMatch = clean.match(/^([a-zA-Z0-9_-]+)\/[a-zA-Z0-9_-]+\.html$/i);
    if (chapterMatch) {
        const slug = chapterMatch[1].trim();
        return RESERVED_SLUGS.has(slug.toLowerCase()) ? "" : slug;
    }

    // If novel overview format: {slug}.html
    const htmlMatch = clean.match(/^([a-zA-Z0-9_-]+)\.html$/i);
    if (htmlMatch) {
        const slug = htmlMatch[1].trim();
        return RESERVED_SLUGS.has(slug.toLowerCase()) ? "" : slug;
    }

    // Direct slug identifier without extension
    if (!clean.includes("/") && !clean.includes(":") && !clean.includes(".")) {
        const slug = clean.trim();
        if (RESERVED_SLUGS.has(slug.toLowerCase())) return "";
        if (/^[a-zA-Z0-9_-]+$/.test(slug)) return slug;
    }

    return "";
}

/**
 * Normalizes a novel overview URL by ensuring base path https://novgo.net/{slug}.html.
 * Returns empty string if the URL does not correspond to a valid novel path or slug.
 * @param {string} url
 * @returns {string}
 */
function normalizeNovelUrl(url) {
    if (!url || typeof url !== "string") return "";
    const slug = extractSlug(url);
    if (!slug) return "";
    return `https://novgo.net/${slug}.html`;
}

/**
 * Detects whether a paragraph is boilerplate text (separator, coin/pass notice, syndication disclaimer, ad artifact).
 * @param {string} text
 * @returns {boolean}
 */
function isBoilerplateParagraph(text) {
    if (!text || typeof text !== "string") return true;
    const trimmed = text.trim();
    if (!trimmed) return true;

    // Horizontal line separators (e.g. ===================, -------------------, * * *)
    if (/^[=\-_*~#\s]{3,}$/.test(trimmed)) return true;

    // Coin / fast pass / contract notices
    if (/Coins spent on books that aren[’']t selected will be refunded/i.test(trimmed)) return true;
    if (/Fast Passes will not be refunded/i.test(trimmed)) return true;
    if (/The selected book will have a mark on the corner/i.test(trimmed)) return true;

    // Webnovel / author watermarks & external syndication disclaimers
    if (/find authorized novels in Webnovel/i.test(trimmed)) return true;
    if (/visit (?:www\.)?webnovel\.com/i.test(trimmed)) return true;

    // Platform notices & error reporting footers
    if (/If you find any errors \([^)]+\),? [Pp]lease let us know/i.test(trimmed)) return true;
    if (/Visit and read more novel to help us update chapter quickly/i.test(trimmed)) return true;
    if (/Use arrow keys \([^)]+\) to PREV\/NEXT chapter/i.test(trimmed)) return true;
    if (/Please keep discussions friendly and useful for other readers/i.test(trimmed)) return true;
    if (/Comments that break these rules may be removed/i.test(trimmed)) return true;
    if (/Please report (?:any )?(?:duplicate|missing) (?:chapters?|errors?)/i.test(trimmed)) return true;

    return false;
}

/**
 * Checks for Cloudflare challenge pages and throws a descriptive error.
 * @param {object} resp
 */
function checkCloudflareChallenge(resp) {
    if (resp && resp.body) {
        const isChallenge = (resp.status === 403 || resp.status === 503) ||
            resp.body.includes("Just a moment...") ||
            resp.body.includes("challenge-running") ||
            (resp.body.includes("cf-turnstile") && !resp.body.includes("<div class=\"tit\">"));
        if (isChallenge && (resp.status === 403 || resp.status === 503 || resp.body.includes("Cloudflare") || resp.body.includes("cloudflare"))) {
            throw new Error("NovGo security check required: Cloudflare challenge triggered.");
        }
    }
}

/**
 * Safe HTTP GET with retry on 429 or server errors.
 * @param {string} url
 * @param {object} [headers]
 * @param {number} [retries]
 * @returns {Promise<any>}
 */
async function fetchWithRetry(url, headers = {}, retries = 1) {
    let resp = null;
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            resp = await http.get(url, headers);
            checkCloudflareChallenge(resp);
            if (resp && resp.status === 200) {
                return resp;
            }
            if (resp && resp.status < 500 && resp.status !== 429) {
                return resp;
            }
        } catch (e) {
            if (e.message && e.message.includes("security check required")) {
                throw e;
            }
            if (attempt === retries) throw e;
        }
    }
    return resp;
}

const source = {
    /**
     * Search novels matching a query string.
     * @param {string} query - Search keyword.
     * @param {number} [page=1] - 1-based page index.
     * @returns {Promise<Array<{ title: string, link: string, imgSrc: string }>>}
     */
    async searchNovels(query, page = 1) {
        if (!query || !query.trim()) return [];

        const trimmed = query.trim();
        const p = Math.max(1, parseInt(page, 10) || 1);
        const searchUrl = p > 1
            ? `https://novgo.net/search?keyword=${encodeURIComponent(trimmed)}&page=${p}`
            : `https://novgo.net/search?keyword=${encodeURIComponent(trimmed)}`;

        let resp = await fetchWithRetry(searchUrl);
        if (!resp || resp.status !== 200 || !resp.body) {
            return [];
        }

        const $ = parseHtml(resp.body);
        const results = [];
        const seenLinks = new Set();

        const rows = $(".col-truyen-main .ul-list1 .con, .archive .fwn-rank-list .con, .ul-list1 .con, .li-row .con, .con:has(.tit)");
        for (const row of rows) {
            const titleA = row.first(".txt h3.tit a, h3.tit a, .tit a, a.tit");
            if (!titleA) continue;

            const href = titleA.attr("href");
            if (!href) continue;

            const link = normalizeNovelUrl(href);
            if (!link || seenLinks.has(link)) continue;

            let title = decodeHtmlEntities(titleA.attr("title")?.trim() || titleA.text().trim());
            title = title.replace(/\s+/g, " ").trim();
            if (!title) continue;

            const imgE = row.first(".pic img, picture img, img");
            let imgSrc = "";
            if (imgE) {
                const dataSrc = (imgE.attr("data-src") || imgE.attr("data-original") || imgE.attr("data-cfsrc") || "").trim();
                const src = (imgE.attr("src") || "").trim();
                if (dataSrc && !dataSrc.startsWith("data:") && !dataSrc.includes("placeholder")) {
                    imgSrc = toAbsoluteUrl(dataSrc);
                } else if (src && !src.startsWith("data:") && !src.includes("placeholder")) {
                    imgSrc = toAbsoluteUrl(src);
                } else if (dataSrc) {
                    imgSrc = toAbsoluteUrl(dataSrc);
                } else if (src) {
                    imgSrc = toAbsoluteUrl(src);
                }
            }

            if (!imgSrc && imgE) {
                const srcset = imgE.attr("srcset") || "";
                if (srcset) {
                    const firstSrc = srcset.split(",")[0].trim().split(" ")[0].trim();
                    if (firstSrc) imgSrc = toAbsoluteUrl(firstSrc);
                }
            }

            seenLinks.add(link);
            results.push({ title, link, imgSrc });
        }

        // Direct selector fallback if container didn't match rows
        if (results.length === 0) {
            const titleLinks = $(".col-truyen-main .tit a, .tit a, h3 a[href*='.html']");
            for (const titleA of titleLinks) {
                const href = titleA.attr("href");
                if (!href) continue;

                const link = normalizeNovelUrl(href);
                if (!link || seenLinks.has(link)) continue;

                let title = decodeHtmlEntities(titleA.attr("title")?.trim() || titleA.text().trim());
                title = title.replace(/\s+/g, " ").trim();
                if (!title) continue;

                seenLinks.add(link);
                results.push({ title, link, imgSrc: "" });
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
        if (!novelUrl || typeof novelUrl !== "string" || !novelUrl.trim() || novelUrl.trim() === "#" || novelUrl.trim().startsWith("javascript:")) {
            throw new Error("novelUrl is required");
        }

        const cleanUrl = normalizeNovelUrl(novelUrl);
        if (!cleanUrl) {
            throw new Error("Invalid novelUrl: " + novelUrl);
        }

        let resp = await fetchWithRetry(cleanUrl);
        if (!resp || resp.status !== 200 || !resp.body) {
            throw new Error(`Failed to load novel page: HTTP ${resp ? resp.status : "unknown"}`);
        }

        const $ = parseHtml(resp.body);

        // Title
        let title = $("h1.tit, .m-desc h1.tit, .tit, h1").first()?.text().trim() || "";
        if (!title) {
            const ogName = $("meta[property='og:novel:novel_name']").attr("content") || "";
            if (ogName) title = ogName.trim();
        }
        if (!title) {
            const ogTitle = $("meta[property='og:title']").attr("content") || $("meta[name='title']").attr("content") || "";
            title = ogTitle
                .replace(/^Read\s+/i, "")
                .replace(/\s*novel online free\s*-\s*NOVGO\.NET.*$/i, "")
                .replace(/\s*-\s*NOVGO\.NET.*$/i, "")
                .trim();
        }
        title = decodeHtmlEntities(title).replace(/\s+/g, " ").trim();

        // Author(s) - Supports multiple authors (e.g., English translated name + raw name)
        let author = "";
        const authorLinks = $(".m-imgtxt .txt .item:has(.glyphicon-user) .right a, .m-imgtxt a[href*='/author/'], a[href*='/author/']");
        if (authorLinks.length > 0) {
            const authorsList = [];
            const seenAuthors = new Set();
            for (const a of authorLinks) {
                const name = decodeHtmlEntities(a.text().trim()).replace(/\s+/g, " ").trim();
                if (name && !seenAuthors.has(name)) {
                    seenAuthors.add(name);
                    authorsList.push(name);
                }
            }
            author = authorsList.join(", ");
        }
        if (!author) {
            const metaAuthor = $("meta[property='og:novel:author']").attr("content") || $("meta[name='author']").attr("content") || "";
            if (metaAuthor) author = decodeHtmlEntities(metaAuthor.trim()).replace(/\s+/g, " ").trim();
        }

        // Cover Image
        let imageUrl = "";
        const coverImg = $(".m-imgtxt .pic img, .m-book1 .pic img, .pic img").first();
        if (coverImg) {
            const dataSrc = (coverImg.attr("data-src") || coverImg.attr("data-original") || coverImg.attr("data-cfsrc") || "").trim();
            const src = (coverImg.attr("src") || "").trim();
            if (dataSrc && !dataSrc.startsWith("data:") && !dataSrc.includes("placeholder")) {
                imageUrl = toAbsoluteUrl(dataSrc);
            } else if (src && !src.startsWith("data:") && !src.includes("placeholder")) {
                imageUrl = toAbsoluteUrl(src);
            } else if (dataSrc) {
                imageUrl = toAbsoluteUrl(dataSrc);
            } else if (src) {
                imageUrl = toAbsoluteUrl(src);
            }

            if (!imageUrl) {
                const srcset = coverImg.attr("srcset") || "";
                if (srcset) {
                    const firstSrc = srcset.split(",")[0].trim().split(" ")[0].trim();
                    if (firstSrc) imageUrl = toAbsoluteUrl(firstSrc);
                }
            }
        }
        if (!imageUrl) {
            const metaImg = $("meta[property='og:image']").attr("content") || $("meta[name='image']").attr("content") || $("meta[name='twitter:image']").attr("content") || "";
            if (metaImg) imageUrl = toAbsoluteUrl(metaImg);
        }

        // Genres
        let genres = "";
        const genreLinks = $(".m-imgtxt .txt .item:has(.glyphicon-th-list) .right a, .m-imgtxt a[href*='/genre/'], a[href*='/genre/']");
        if (genreLinks.length > 0) {
            const genreList = [];
            const seenGenres = new Set();
            for (const a of genreLinks) {
                const g = decodeHtmlEntities(a.text().trim()).replace(/\s+/g, " ").trim();
                if (g && !seenGenres.has(g)) {
                    seenGenres.add(g);
                    genreList.push(g);
                }
            }
            genres = genreList.join(", ");
        }
        if (!genres) {
            const metaGenre = $("meta[property='og:novel:genre']").attr("content") || "";
            if (metaGenre) genres = decodeHtmlEntities(metaGenre.trim()).replace(/\s+/g, " ").trim();
        }

        // Status
        let status = "";
        const statusItem = $(".m-imgtxt .txt .item:has(.glyphicon-time) .right").first();
        if (statusItem) {
            status = decodeHtmlEntities(statusItem.text().trim()).replace(/\s+/g, " ").trim();
        }
        if (!status) {
            const metaStatus = $("meta[property='og:novel:status']").attr("content") || "";
            if (metaStatus === "1") status = "Ongoing";
            else if (metaStatus === "2") status = "Completed";
            else if (metaStatus) status = metaStatus;
        }
        if (!status) status = "Ongoing";

        const tags = "";

        // Description
        let description = "";
        const descEl = $("#novel-summary-inner, .m-desc .txt .inner, .m-desc .inner, .m-desc .txt").first();
        if (descEl) {
            descEl.remove("script, style, iframe, .ads, .ad, noscript, .showheight, .btn-more");
            const pElements = descEl.select("p");
            if (pElements.length > 0) {
                const pTexts = [];
                for (const p of pElements) {
                    const html = p.html();
                    let t;
                    if (html && /<br\s*[\/]?>/i.test(html)) {
                        t = html
                            .replace(/\s*<br\s*[\/]?>\s*<br\s*[\/]?>\s*/gi, "\n\n")
                            .replace(/\s*<br\s*[\/]?>\s*/gi, "\n")
                            .replace(/<[^>]+>/g, "")
                            .trim();
                    } else {
                        t = p.text().trim();
                    }
                    t = decodeHtmlEntities(t).trim();
                    if (t) pTexts.push(t);
                }
                description = pTexts.join("\n\n");
            }
            if (!description) {
                const rawHtml = descEl.html();
                if (rawHtml) {
                    description = rawHtml
                        .replace(/\s*<br\s*[\/]?>\s*/gi, "\n\n")
                        .replace(/<\/p>/gi, "\n\n")
                        .replace(/<[^>]+>/g, "")
                        .split(/\n\s*\n/)
                        .map(p => decodeHtmlEntities(p.trim()))
                        .filter(Boolean)
                        .join("\n\n");
                } else {
                    description = decodeHtmlEntities(descEl.text().trim());
                }
            }
        }
        if (!description) {
            const metaDesc = $("meta[property='og:description']").attr("content") || $("meta[name='description']").attr("content") || "";
            description = decodeHtmlEntities(metaDesc.trim());
        }

        // Chapter List Extraction
        // Novel ID (truyen-id) extraction
        let novelId = $("#list-chapter").attr("data-novel-id") ||
                      $("#novel-score").attr("data-novel-id") ||
                      $("#novel-comments").attr("data-novel-id") ||
                      $("#novel-library-actions").attr("data-novel-id") ||
                      $("#truyen-id").attr("value") ||
                      "";
        if (!novelId) {
            const m = resp.body.match(/data-novel-id=["'](\d+)["']/i) ||
                      resp.body.match(/id=["']truyen-id["'][^>]*value=["'](\d+)["']/i) ||
                      resp.body.match(/novelId\s*[:=]\s*['"]?(\d+)['"]?/i);
            if (m) novelId = m[1];
        }

        const chapters = [];
        const seenLinks = new Set();

        function addChapter(href, rawTitle) {
            if (!href) return;
            const link = toAbsoluteUrl(href);
            if (!link || seenLinks.has(link) || link.includes("javascript:") || link.endsWith("#")) return;
            let title = decodeHtmlEntities(rawTitle ? String(rawTitle).trim() : "");
            title = title.replace(/\s+/g, " ").trim();
            if (!title) title = `Chapter ${chapters.length + 1}`;
            seenLinks.add(link);
            chapters.push({ title, link, text: "" });
        }

        const ajaxHeaders = {
            "X-Requested-With": "XMLHttpRequest",
            "Referer": cleanUrl
        };

        // Strategy 1 (Primary): Fast full chapter catalog via ajax-chapter-option
        if (novelId) {
            try {
                const optionUrl = `https://novgo.net/ajax-chapter-option?novelId=${novelId}`;
                const optResp = await fetchWithRetry(optionUrl, ajaxHeaders);
                if (optResp && optResp.status === 200 && optResp.body) {
                    const $opt = parseHtml(optResp.body);
                    const options = $opt("option");
                    for (const opt of options) {
                        const val = opt.attr("value")?.trim();
                        if (val) {
                            addChapter(val, opt.text());
                        }
                    }

                    // Fallback to regex parsing if Jsoup parsed single root option differently
                    if (chapters.length === 0) {
                        const optRegex = /<option\b[^>]*\bvalue=["']([^"']+)["'][^>]*>([\s\S]*?)<\/option>/gi;
                        let match;
                        while ((match = optRegex.exec(optResp.body)) !== null) {
                            const val = match[1].trim();
                            const text = match[2].replace(/<[^>]+>/g, "").trim();
                            addChapter(val, text);
                        }
                    }
                }
            } catch (e) {
                console.warn("ajax-chapter-option failed: " + e.message);
            }
        }

        // Strategy 2 (Fallback): ajax-chapter-list paginated endpoint
        if (chapters.length === 0 && novelId) {
            try {
                const listUrl = `https://novgo.net/ajax-chapter-list?novelId=${novelId}&page=1`;
                const listResp = await fetchWithRetry(listUrl, ajaxHeaders);
                if (listResp && listResp.status === 200 && listResp.body) {
                    let data = null;
                    try {
                        data = JSON.parse(listResp.body);
                    } catch (_) {}
                    if (data && data.html) {
                        const $list = parseHtml(data.html);
                        const links = $list("li a.con, li a, a.con, a[href*='.html']");
                        for (const a of links) {
                            addChapter(a.attr("href"), a.attr("title") || a.text());
                        }

                        const totalPage = parseInt(data.totalPage, 10) || 1;
                        if (totalPage > 1) {
                            const maxPage = Math.min(totalPage, 100);
                            for (let p = 2; p <= maxPage; p += 4) {
                                const chunkPromises = [];
                                for (let pageNum = p; pageNum < p + 4 && pageNum <= maxPage; pageNum++) {
                                    const pUrl = `https://novgo.net/ajax-chapter-list?novelId=${novelId}&page=${pageNum}`;
                                    chunkPromises.push(
                                        fetchWithRetry(pUrl, ajaxHeaders).then(res => {
                                            if (res && res.status === 200 && res.body) {
                                                try {
                                                    const d = JSON.parse(res.body);
                                                    return d.html || "";
                                                } catch (_) {
                                                    return "";
                                                }
                                            }
                                            return "";
                                        }).catch(() => "")
                                    );
                                }
                                const chunkResults = await Promise.all(chunkPromises);
                                for (const html of chunkResults) {
                                    if (html) {
                                        const $pList = parseHtml(html);
                                        for (const a of $pList("li a.con, li a, a.con, a[href*='.html']")) {
                                            addChapter(a.attr("href"), a.attr("title") || a.text());
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            } catch (e) {
                console.warn("ajax-chapter-list failed: " + e.message);
            }
        }

        // Strategy 3 (Fallback): Static DOM fallback from novel page
        if (chapters.length === 0) {
            const staticLinks = $("#idData li a, .m-newest2 ul li a, .ul-list5 li a, #list-chapter a.con, a[href*='/chapter-']");
            for (const a of staticLinks) {
                addChapter(a.attr("href"), a.attr("title") || a.text());
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
            throw new Error(`Failed to load chapter page: HTTP ${resp ? resp.status : "unknown"}`);
        }

        const $ = parseHtml(resp.body);
        const container = $("#chapter-content").first() || $(".chapter-c").first() || $(".txt.fwn-reader-txt").first() || $(".m-read .txt").first() || $("#article").first() || $(".txt").first();
        if (!container) {
            throw new Error(`Failed to load chapter container`);
        }

        /* Paragraph selection */
        const pElements = container.select("p");
        if (pElements.length > 0) {
            const paragraphs = pElements.map(p => decodeHtmlEntities(p.text().trim()))
                .filter(text => text.length > 0 && !isBoilerplateParagraph(text))
                .map(p => `<p>${p}</p>`)
                .join("");
            return paragraphs;
        }
        throw new Error(`Failed to load chapter paragraphs`);
    }
};
