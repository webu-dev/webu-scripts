/**
 * Source script for novelping.com
 */
//@ts-check

/**
 * Decodes standard HTML entities in text.
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
        .replace(/&quot;/gi, "\"")
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&rsquo;|&lsquo;/gi, "'")
        .replace(/&rdquo;|&ldquo;/gi, "\"")
        .replace(/&hellip;|…/gi, "...")
        .replace(/&mdash;/gi, "—")
        .replace(/&ndash;/gi, "–")
        .replace(/&#x([0-9a-fA-F]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec, 10)));
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
    } else if (clean.startsWith("novelping.com")) {
        clean = `https://${clean}`;
    } else if (!clean.startsWith("https://")) {
        clean = `https://novelping.com${clean.startsWith("/") ? "" : "/"}${clean}`;
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
 * Extracts novel slug identifier from a URL or raw slug string.
 * @param {string} url
 * @returns {string}
 */
function extractSlug(url) {
    if (!url || typeof url !== "string") return "";
    const clean = url.trim().split("?")[0].split("#")[0];
    const match = clean.match(/\/book\/([^/?#]+)/i);
    if (match) return match[1].trim();
    if (!clean.includes("/") && !clean.includes(":") && clean.length > 0) {
        return clean;
    }
    return "";
}

/**
 * Normalizes a novel overview URL by ensuring base path https://novelping.com/book/{slug}.
 * Returns empty string if the URL does not correspond to a valid novel path or slug.
 * @param {string} url
 * @returns {string}
 */
function normalizeNovelUrl(url) {
    if (!url || typeof url !== "string") return "";
    let clean = toAbsoluteUrl(url);
    if (!clean) {
        const slug = extractSlug(url);
        return slug ? `https://novelping.com/book/${slug}` : "";
    }
    clean = clean.split("?")[0].split("#")[0];
    const slug = extractSlug(clean);
    if (slug) {
        return `https://novelping.com/book/${slug}`;
    }
    return "";
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
            if (resp && resp.status === 200) {
                return resp;
            }
            if (resp && resp.status < 500 && resp.status !== 429) {
                return resp;
            }
        } catch (e) {
            if (attempt === retries) throw e;
        }
    }
    return resp;
}

const source = {
    /**
     * Search novels matching a query string using standard paginated search page.
     * Note: Ignore live autocomplete endpoint (/ajax/search-novel) per requirements.
     * @param {string} query - Search keyword.
     * @param {number} [page=1] - 1-based page index.
     * @returns {Promise<Array<{ title: string, link: string, imgSrc: string }>>}
     */
    async searchNovels(query, page = 1) {
        if (!query || !query.trim()) return [];

        const trimmed = query.trim();
        const searchUrl = `https://novelping.com/search?keyword=${encodeURIComponent(trimmed)}&page=${page}`;

        let resp = await fetchWithRetry(searchUrl);
        if (!resp || resp.status !== 200 || !resp.body) {
            return [];
        }

        const $ = parseHtml(resp.body);
        const results = [];
        const seenLinks = new Set();

        // 1. Process rows strictly in search results container (excluding sidebar .list-side / .hot-item)
        const rows = $("#search-results .row, div[data-search-results] .row, .col-novel-main .list-novel:not(.list-side) .row");
        for (const row of rows) {
            if (row.hasClass("advanced-search__row") || row.hasClass("hot-item")) continue;

            const titleA = row.first("h3.novel-title a, .novel-title a");
            if (!titleA) continue;

            const href = titleA.attr("href");
            if (!href) continue;

            const link = normalizeNovelUrl(href) || toAbsoluteUrl(href);
            if (!link || seenLinks.has(link)) continue;

            let title = decodeHtmlEntities(titleA.attr("title")?.trim() || titleA.text().trim());
            if (!title) continue;

            const imgE = row.first("img.cover, img.novel-cover-loading, img.novel-cover, img");
            let imgSrc = "";
            if (imgE) {
                const dataSrc = (imgE.attr("data-src") || imgE.attr("data-original") || "").trim();
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

            seenLinks.add(link);
            results.push({ title, link, imgSrc });
        }

        // 2. Direct selector fallback if no rows matched in container
        if (results.length === 0) {
            const titleLinks = $("#search-results h3.novel-title a, #search-results .novel-title a, div[data-search-results] .novel-title a");
            for (const titleA of titleLinks) {
                const href = titleA.attr("href");
                if (!href) continue;
                const link = normalizeNovelUrl(href) || toAbsoluteUrl(href);
                if (!link || seenLinks.has(link)) continue;

                let title = decodeHtmlEntities(titleA.attr("title")?.trim() || titleA.text().trim());
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
        if (!novelUrl || !novelUrl.trim()) {
            throw new Error("novelUrl is required");
        }

        const cleanUrl = normalizeNovelUrl(novelUrl);
        if (!cleanUrl) {
            throw new Error("Invalid novelUrl: " + novelUrl);
        }

        let slug = extractSlug(cleanUrl);

        let resp = await fetchWithRetry(cleanUrl);
        if (!resp || resp.status !== 200 || !resp.body) {
            throw new Error(`Failed to load novel page: HTTP ${resp ? resp.status : "unknown"}`);
        }

        const $ = parseHtml(resp.body);

        // If slug was not in URL, attempt extraction from DOM
        if (!slug) {
            slug = $("#rating").first()?.attr("data-novel-id") ||
                   $("[data-novel-id]").first()?.attr("data-novel-id") ||
                   $("input#truyen-id, input#novel-id").first()?.attr("value") || "";
            if (!slug) {
                const m = resp.body.match(/data-novel-id="([^"]+)"/i);
                if (m) slug = m[1].trim();
            }
        }

        // Title
        let title = $(".col-info-desc h3.title, h3.title[itemprop='name'], h3.title, h1 a[itemprop='item'] span[itemprop='name'], h1").first()?.text().trim() || "";
        if (!title) {
            const ogTitle = $("meta[property='og:title']").attr("content") || $("meta[name='title']").attr("content") || "";
            title = ogTitle
                .replace(/\s*online free.*$/i, "")
                .replace(/^Read\s+/i, "")
                .replace(/\s*-\s*NovelPing.*$/i, "")
                .trim();
        }
        title = decodeHtmlEntities(title);

        // Author (scoped strictly to novel metadata to prevent cross-talk from sidebar/other tabs)
        let author = "";
        const authorLinks = $(".info-meta a[href*='/author/'], .col-info-desc a[href*='/author/'], .info a[href*='/author/']");
        const authorNames = [];
        for (const a of authorLinks) {
            if (a.hasClass("mfa-author__all") || a.hasClass("mfa-author__more")) continue;
            const text = decodeHtmlEntities(a.text().trim());
            if (!text || /all novels/i.test(text) || text.includes("→") || text.includes("←")) continue;
            if (!authorNames.includes(text)) {
                authorNames.push(text);
            }
        }
        author = authorNames.join(", ");

        if (!author) {
            const metaAuthor = $("meta[property='og:novel:author']").attr("content") ||
                               $("meta[name='author']").attr("content") ||
                               $("span[itemprop='author'] meta[itemprop='name']").attr("content") || "";
            if (metaAuthor) author = decodeHtmlEntities(metaAuthor.trim());
        }
        if (!author) {
            const infoItems = $(".info-meta li, .info li, .info > div, .info div");
            for (const item of infoItems) {
                const t = item.text();
                if (/author:/i.test(t)) {
                    const cleanT = t.replace(/^Author:\s*/i, "").replace(/All novels.*$/i, "").trim();
                    author = decodeHtmlEntities(cleanT);
                    break;
                }
            }
        }

        // Cover Image (prioritizes data-src / data-original over placeholder src)
        let imageUrl = "";
        const coverImg = $(".col-info-desc .books img, .books img, img.novel-cover, .book img").first();
        if (coverImg) {
            const dataSrc = (coverImg.attr("data-src") || coverImg.attr("data-original") || "").trim();
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
        }
        if (!imageUrl) {
            const metaImg = $("meta[property='og:image']").attr("content") || $("meta[name='image']").attr("content") || "";
            if (metaImg) imageUrl = toAbsoluteUrl(metaImg);
        }

        // Description (handles both <p> and <br> paragraph structures)
        let description = "";
        const descEl = $("#novel-description-content, .desc-text[itemprop='description'], .desc-text").first();
        if (descEl) {
            descEl.remove("script, style, iframe, .ads, .ad, noscript");
            const pElements = descEl.select("p");
            if (pElements.length > 0) {
                const pTexts = [];
                for (const p of pElements) {
                    const html = p.html();
                    let t;
                    if (html && /<br\s*[\/]?>/i.test(html)) {
                        t = html.replace(/<br\s*[\/]?>\s*/gi, "\n").replace(/<[^>]+>/g, "").trim();
                    } else {
                        t = p.text().trim();
                    }
                    t = decodeHtmlEntities(t).trim();
                    if (t.length > 0) pTexts.push(t);
                }
                description = pTexts.join("\n\n");
            }
            if (!description) {
                const rawHtml = descEl.html();
                if (rawHtml) {
                    description = decodeHtmlEntities(
                        rawHtml.replace(/<br\s*[\/]?>\s*/gi, "\n").replace(/<\/p>/gi, "\n\n").replace(/<[^>]+>/g, "").trim()
                    );
                } else {
                    description = decodeHtmlEntities(descEl.text().trim());
                }
            }
        }
        if (!description) {
            const metaDesc = $("meta[name='description']").attr("content") || $("meta[property='og:description']").attr("content") || "";
            description = decodeHtmlEntities(metaDesc.trim());
        }

        // Status
        let status = $(".info-meta a[href*='/sort/'], .info a[href*='/sort/']").first()?.text().trim() || "";
        if (!status) {
            status = $("meta[property='og:novel:status']").attr("content")?.trim() || "";
        }
        if (!status) {
            const infoText = $(".info-meta, .info").text();
            if (/completed/i.test(infoText)) {
                status = "Completed";
            } else if (/ongoing/i.test(infoText)) {
                status = "Ongoing";
            }
        }

        // Genres
        const genreElements = $(".info-meta a[href*='/novelping-genres/'], .info-meta a[href*='/genre/'], .info a[href*='/genre/']");
        let genres = Array.from(new Set(
            genreElements.map(el => decodeHtmlEntities(el.text().trim())).filter(Boolean)
        )).join(", ");
        if (!genres) {
            const metaGenres = $("meta[property='og:novel:genre']").attr("content") || "";
            if (metaGenres) {
                genres = metaGenres.split(",").map(g => decodeHtmlEntities(g.trim())).filter(Boolean).join(", ");
            }
        }

        // Tags
        const tagElements = $(".tag-container a[href*='/tag/'], .info-meta a[href*='/tag/'], .info a[href*='/tag/']");
        const tags = Array.from(new Set(
            tagElements.map(el => decodeHtmlEntities(el.text().trim())).filter(Boolean)
        )).join(", ");

        // Chapter List
        const chapters = [];
        const seenChapterLinks = new Set();
        const normCleanUrl = cleanUrl.replace(/\/+$/, "");

        function addChapter(href, rawTitle) {
            if (!href) return;
            const link = toAbsoluteUrl(href);
            if (!link || seenChapterLinks.has(link)) return;

            const normLink = link.replace(/\/+$/, "");
            if (normLink === normCleanUrl) return;
            if (/[?&]page=\d+/i.test(link)) return;

            // Must be under the novel path or contain explicit chapter identifier
            if (!normLink.startsWith(normCleanUrl + "/") && !/\/chapter[-_]/i.test(normLink)) {
                return;
            }

            let chTitle = decodeHtmlEntities((rawTitle || "").trim());
            // Strip comment count suffix if anchor inner text contained comment badge
            chTitle = chTitle.replace(/\s+\d+\s*(?:comments?)?$/i, "").trim();
            if (!chTitle) {
                const match = link.match(/\/chapter[-_]?([^/?#]+)/i);
                chTitle = match ? `Chapter ${match[1].replace(/[-_]/g, " ")}` : "Chapter";
            }

            seenChapterLinks.add(link);
            chapters.push({
                title: chTitle,
                link,
                text: ""
            });
        }

        // Strategy 1: Full Chapter Archive endpoint via AJAX
        if (slug) {
            try {
                const archiveUrl = `https://novelping.com/ajax/chapter-archive?novelId=${encodeURIComponent(slug)}`;
                let archiveResp = await fetchWithRetry(archiveUrl, { "x-requested-with": "XMLHttpRequest" });
                if (archiveResp && archiveResp.status === 200 && archiveResp.body) {
                    const $archive = parseHtml(archiveResp.body);
                    let items = $archive("li[data-chapter-item] a, .chapter-archive-panel li a, .list-chapter li a, a[href*='/chapter-']");

                    // Fallback inside template if Jsoup didn't query template children
                    if (items.length === 0) {
                        const tmplMatch = archiveResp.body.match(/<template[^>]*data-chapter-item-template[^>]*>([\s\S]*?)<\/template>/i) ||
                                          archiveResp.body.match(/<template[^>]*>([\s\S]*?)<\/template>/i);
                        if (tmplMatch) {
                            const $tmpl = parseHtml(tmplMatch[1]);
                            items = $tmpl("li[data-chapter-item] a, a[href*='/chapter-'], a");
                        }
                    }

                    for (const a of items) {
                        const href = a.attr("href");
                        if (!href) continue;
                        const titleSpan = a.first("span.chapter-title, .chapter-title, span.nchr-text");
                        const chTitle = titleSpan ? titleSpan.text() : (a.attr("title") || a.text());
                        addChapter(href, chTitle);
                    }

                    // Robust regex fallback if still 0 chapters (handles reversed attributes, single/double quotes)
                    if (chapters.length === 0) {
                        const aTagRegex = /<a\b([\s\S]*?)>([\s\S]*?)<\/a>/gi;
                        let tagMatch;
                        while ((tagMatch = aTagRegex.exec(archiveResp.body)) !== null) {
                            const attrs = tagMatch[1];
                            const innerContent = tagMatch[2];
                            const hrefMatch = attrs.match(/href=["']([^"']+)["']/i);
                            if (!hrefMatch) continue;
                            const href = hrefMatch[1];
                            const titleAttrMatch = attrs.match(/title=["']([^"']*)["']/i);
                            const titleSpanMatch = innerContent.match(/class=["'][^"']*(?:chapter-title|nchr-text)[^"']*["'][^>]*>([^<]+)<\/span>/i);
                            const title = titleSpanMatch ? titleSpanMatch[1] : (titleAttrMatch ? titleAttrMatch[1] : innerContent.replace(/<[^>]+>/g, "").trim());
                            addChapter(href, title);
                        }
                    }
                }
            } catch (e) {
                console.warn("Failed to fetch chapter archive: " + e.message);
            }
        }

        // Strategy 2: Chapter Option Jump Dropdown endpoint via AJAX
        if (chapters.length === 0 && slug) {
            try {
                const optionUrl = `https://novelping.com/ajax/chapter-option?novelId=${encodeURIComponent(slug)}&currentChapterId=chapter-1`;
                let optResp = await fetchWithRetry(optionUrl, { "x-requested-with": "XMLHttpRequest" });
                if (optResp && optResp.status === 200 && optResp.body) {
                    const $opt = parseHtml(optResp.body);
                    const options = $opt("option");
                    for (const opt of options) {
                        const href = opt.attr("value");
                        if (!href || href === "0" || href === "#" || href.startsWith("javascript:")) continue;
                        addChapter(href, opt.text());
                    }
                }
            } catch (e) {
                console.warn("Failed to fetch chapter options: " + e.message);
            }
        }

        // Strategy 3: Overview page DOM fallback
        if (chapters.length === 0) {
            const staticLinks = $(".chapter-archive-grid a, #list-chapter a, .list-chapter li a, a[href*='/chapter-']");
            for (const a of staticLinks) {
                const href = a.attr("href");
                if (!href) continue;
                const titleSpan = a.first("span.chapter-title, .chapter-title, span.nchr-text");
                const chTitle = titleSpan ? titleSpan.text() : (a.attr("title") || a.text());
                addChapter(href, chTitle);
            }

            // Overview page template fallback
            if (chapters.length === 0) {
                const tmplMatch = resp.body.match(/<template[^>]*data-first-chapter-template[^>]*>([\s\S]*?)<\/template>/i) ||
                                  resp.body.match(/<template[^>]*>([\s\S]*?)<\/template>/i);
                if (tmplMatch) {
                    const $tmpl = parseHtml(tmplMatch[1]);
                    const tmplLinks = $tmpl("a[href*='/chapter-'], li a");
                    for (const a of tmplLinks) {
                        const href = a.attr("href");
                        if (!href) continue;
                        const titleSpan = a.first("span.chapter-title, .chapter-title, span.nchr-text");
                        const chTitle = titleSpan ? titleSpan.text() : (a.attr("title") || a.text());
                        addChapter(href, chTitle);
                    }
                }
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

        let resp = await fetchWithRetry(url);
        if (!resp || resp.status !== 200 || !resp.body) {
            throw new Error(`Failed to load chapter page: HTTP ${resp ? resp.status : "unknown"}`);
        }

        const $ = parseHtml(resp.body);
        const content = $("#chr-content, .chr-c, .reading-content, #chapter-content").first();
        let paragraphs = "";

        if (content) {
            // Clean ads, navigation, scripts, styles
            content.remove(".js-ad-slot, script, style, ins, .chapternav, iframe, noscript, .ads, .ad, div[align='center'], div.hidden");

            const pElements = content.select("p");
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
                    if (t.length > 0) {
                        pTexts.push(t);
                    }
                }
                paragraphs = pTexts.map(p => `<p>${p}</p>`).join("");
            }

            // Fallback if no <p> tags found or all empty
            if (!paragraphs) {
                const rawHtml = content.html();
                if (rawHtml) {
                    const withNewlines = rawHtml
                        .replace(/\s*<br\s*[\/]?>\s*/gi, "\n\n")
                        .replace(/<\/p>/gi, "\n\n")
                        .replace(/<[^>]+>/g, "");
                    paragraphs = withNewlines
                        .split(/\n\s*\n/)
                        .map(p => decodeHtmlEntities(p.trim()))
                        .filter(t => t.length > 0)
                        .join("\n\n");
                } else {
                    paragraphs = decodeHtmlEntities(content.text().trim());
                }
            }
        }

        // Strategy 2: Chapter Fragment AJAX Fallback if DOM content was empty
        if (!paragraphs) {
            const m = url.match(/\/book\/([^/?#]+)\/([^/?#]+)/i);
            if (m) {
                try {
                    const fragUrl = `https://novelping.com/ajax/chapter-fragment?novel_id=${encodeURIComponent(m[1])}&chapter_id=${encodeURIComponent(m[2])}`;
                    let fragResp = await fetchWithRetry(fragUrl, { "x-requested-with": "XMLHttpRequest" });
                    if (fragResp && fragResp.status === 200 && fragResp.body) {
                        const fragData = JSON.parse(fragResp.body);
                        const html = fragData.chapter?.content_html || fragData.content_html || "";
                        if (html) {
                            const $frag = parseHtml(html);
                            $frag.remove(".js-ad-slot, script, style, ins, iframe, noscript, .ads, .ad");
                            const fragPs = $frag("p");
                            if (fragPs.length > 0) {
                                const fragTexts = [];
                                for (const p of fragPs) {
                                    const h = p.html();
                                    let t = (h && /<br\s*[\/]?>/i.test(h))
                                        ? h.replace(/\s*<br\s*[\/]?>\s*<br\s*[\/]?>\s*/gi, "\n\n").replace(/\s*<br\s*[\/]?>\s*/gi, "\n").replace(/<[^>]+>/g, "").trim()
                                        : p.text().trim();
                                    t = decodeHtmlEntities(t).trim();
                                    if (t.length > 0) fragTexts.push(t);
                                }
                                paragraphs = fragTexts.join("\n\n");
                            } else {
                                paragraphs = decodeHtmlEntities($frag.text().trim());
                            }
                        }
                    }
                } catch (e) {
                    console.warn("Failed to fetch chapter fragment: " + e.message);
                }
            }
        }

        return paragraphs;
    }
};
