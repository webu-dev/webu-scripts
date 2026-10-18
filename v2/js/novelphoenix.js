/**
 * Source script for novelphoenix.com
 */
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
        const searchUrl = `https://novelphoenix.com/search?keyword=${encodeURIComponent(trimmed)}&page=${page}`;
        const resp = await http.get(searchUrl);

        const results = [];
        const seenLinks = new Set();
        if (resp.status === 200 && resp.body) {
            const $ = parseHtml(resp.body);
            const items = $(".col-novel, .novel-item, .list-novel .row > div");

            for (const item of items) {
                const a = item.first("a[href*='/novel/']");
                if (!a) continue;

                const href = a.attr("href");
                if (!href) continue;

                const link = href.startsWith("http")
                    ? href
                    : `https://novelphoenix.com${href.startsWith("/") ? "" : "/"}${href}`;

                if (seenLinks.has(link)) continue;

                const titleEl = item.first(".novel-title") || a;
                let title = titleEl ? titleEl.text().trim() : "";
                if (!title) {
                    title = a.attr("title").trim();
                }

                const img = item.first("img");
                let imgSrc = img ? (img.attr("src") || img.attr("data-src") || "") : "";
                if (imgSrc && !imgSrc.startsWith("http")) {
                    imgSrc = `https://novelphoenix.com${imgSrc.startsWith("/") ? "" : "/"}${imgSrc}`;
                }

                if (title && link) {
                    seenLinks.add(link);
                    results.push({ title, link, imgSrc });
                }
            }
        }

        // Fallback for page 1: live search API if HTML search didn't yield results
        if (results.length === 0 && page === 1) {
            try {
                const liveUrl = `https://novelphoenix.com/ajax/searchLive?keyword=${encodeURIComponent(trimmed)}&type=title`;
                const liveResp = await http.get(liveUrl, {
                    "X-Requested-With": "XMLHttpRequest"
                });
                if (liveResp.status === 200 && liveResp.body) {
                    const parsed = typeof liveResp.body === "string" ? JSON.parse(liveResp.body) : liveResp.body;
                    const data = parsed.data || [];
                    for (const item of data) {
                        if (item.title && item.slug) {
                            const link = `https://novelphoenix.com/novel/${item.slug}`;
                            if (seenLinks.has(link)) continue;
                            seenLinks.add(link);

                            const imgPath = item.image ? (item.image.startsWith("/") ? item.image.slice(1) : item.image) : "";
                            const imgSrc = imgPath ? `https://novelphoenix.com/${imgPath}` : "";
                            results.push({
                                title: item.title.trim(),
                                link,
                                imgSrc
                            });
                        }
                    }
                }
            } catch (e) {
                console.warn("Live search fallback error: " + e.message);
            }
        }

        return results;
    },

    /**
     * Retrieve novel metadata and chapter list.
     * @param {string} novelUrl - Full URL to novel overview page.
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
        const resp = await http.get(novelUrl,);
        if (resp.status !== 200 || !resp.body) {
            throw new Error(`Failed to load novel page: HTTP ${resp.status}`);
        }

        const $ = parseHtml(resp.body);

        // Title
        let title = $(".novel-title").first()?.text().trim() || $("h1").first()?.text().trim() || "";

        // Author
        let author = $(".author span[itemprop='author']").first()?.text().trim() ||
                     $(".author a").first()?.text().trim() ||
                     $(".author").first()?.text().trim() || "";
        author = author.replace(/^Author:\s*/i, "").trim();

        // Cover Image
        let imageUrl = $("figure.cover img, .novel-cover img, figure.novel-cover img").first()?.attr("src") || "";
        if (imageUrl && !imageUrl.startsWith("http")) {
            imageUrl = `https://novelphoenix.com${imageUrl.startsWith("/") ? "" : "/"}${imageUrl}`;
        }

        // Description
        let description = $(".summary .content, .summary").first()?.text().trim() || "";

        // Genres
        const genreElements = $(".categories ul li a, .categories a, .genres a");
        const genres = genreElements.map(el => el.text().trim()).filter(Boolean).join(", ");

        // Tags
        const tagElements = $(".tags a, .tag-list a");
        const tags = tagElements.map(el => el.text().trim()).filter(Boolean).join(", ");

        // Status
        let status = "";
        const statsText = $(".header-stats, .novel-status").text();
        if (/completed/i.test(statsText)) {
            status = "Completed";
        } else if (/ongoing/i.test(statsText)) {
            status = "Ongoing";
        }

        // Chapters list
        let cleanUrl = novelUrl.replace(/\/chapters.*$/, "").replace(/\/+$/, "");
        if (cleanUrl.startsWith("http://")) {
            cleanUrl = "https://" + cleanUrl.slice(7);
        }
        const chapters = [];
        const seenChapterLinks = new Set();
        const seenPageUrls = new Set();
        const firstPageUrl = `${cleanUrl}/chapters?page=1`;
        seenPageUrls.add(firstPageUrl);
        seenPageUrls.add(`${cleanUrl}/chapters`);

        function extractChaptersFromDoc(doc) {
            const list = [];
            const links = doc(".chapter-list a, .list-chapter a");
            for (const a of links) {
                const href = a.attr("href");
                if (href && href.includes("/chapter-")) {
                    const link = href.startsWith("http")
                        ? href
                        : `https://novelphoenix.com${href.startsWith("/") ? "" : "/"}${href}`;

                    if (seenChapterLinks.has(link)) continue;
                    seenChapterLinks.add(link);

                    let chTitle = a.attr("title").trim() ||
                                  a.first(".chapter-title")?.text().trim() ||
                                  a.text().trim();

                    list.push({
                        title: chTitle,
                        link: link,
                        text: ""
                    });
                }
            }
            return list;
        }

        const chaptersResp = await http.get(firstPageUrl);
        if (chaptersResp.status === 200 && chaptersResp.body) {
            const $ch = parseHtml(chaptersResp.body);
            chapters.push(...extractChaptersFromDoc($ch));

            // Check if multiple chapter pages exist in range selector
            const rangeOptions = $ch("select[aria-label='Chapter range'] option, .chapter-range-pager select option");
            const otherPageUrls = [];
            for (const opt of rangeOptions) {
                let val = opt.attr("value");
                if (val) {
                    if (!val.startsWith("http")) {
                        val = `https://novelphoenix.com${val.startsWith("/") ? "" : "/"}${val}`;
                    } else if (val.startsWith("http://")) {
                        val = "https://" + val.slice(7);
                    }
                    val = val.replace(/\/+$/, "");

                    const pageMatch = val.match(/[?&]page=(\d+)/);
                    const pageNum = pageMatch ? parseInt(pageMatch[1], 10) : null;
                    const isFirstPage = pageNum === 1 || val === `${cleanUrl}/chapters` || val.endsWith("/chapters");

                    if (!seenPageUrls.has(val) && !isFirstPage) {
                        seenPageUrls.add(val);
                        otherPageUrls.push(val);
                    }
                }
            }

            if (otherPageUrls.length > 0) {
                otherPageUrls.sort((a, b) => {
                    const pageA = parseInt((a.match(/[?&]page=(\d+)/) || [])[1] || "0", 10);
                    const pageB = parseInt((b.match(/[?&]page=(\d+)/) || [])[1] || "0", 10);
                    return pageA - pageB;
                });

                const chunkSize = 3;
                for (let i = 0; i < otherPageUrls.length; i += chunkSize) {
                    const chunk = otherPageUrls.slice(i, i + chunkSize);
                    try {
                        const responses = await Promise.all(
                            chunk.map(async (u) => {
                                for (let attempt = 0; attempt < 2; attempt++) {
                                    try {
                                        const res = await http.get(u);
                                        if (res && res.status === 200 && res.body) return res;
                                    } catch (e) {
                                        console.warn(`Error fetching chapter page ${u} (attempt ${attempt + 1}): ` + e.message);
                                    }
                                }
                                return null;
                            })
                        );
                        for (const resp of responses) {
                            if (resp && resp.status === 200 && resp.body) {
                                const $other = parseHtml(resp.body);
                                chapters.push(...extractChaptersFromDoc($other));
                            }
                        }
                    } catch (e) {
                        console.warn("Error fetching chunk of chapter pages: " + e.message);
                    }
                }
            }
        }

        // Fallback: if no chapters found via /chapters?page=1, check on overview page
        if (chapters.length === 0) {
            chapters.push(...extractChaptersFromDoc($));
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
     * @param {string} chapterUrl - Full URL to chapter reading page.
     * @returns {Promise<string>}
     */
    async getChapterText(chapterUrl) {
        let resp = await http.get(chapterUrl);
        if ((!resp || resp.status !== 200) && (!resp || resp.status === 429 || resp.status >= 500)) {
            resp = await http.get(chapterUrl);
        }
        if (!resp || resp.status !== 200 || !resp.body) {
            throw new Error(`Failed to load chapter page: HTTP ${resp ? resp.status : "unknown"}`);
        }

        const $ = parseHtml(resp.body);
        const container = $("#chapter-container, .chapter-content, #chr-content").first();
        if (!container) {
            return "";
        }

        // Remove boilerplate, ads, navigation, notice elements
        container.remove(".nf-ads, .box-notification, .chapternav, .box-notice, .report-container, script, ins, style");

        const pElements = container.select("p");
        if (pElements.length > 0) {
            const paragraphs = [];
            for (const p of pElements) {
                const text = p.text().trim();
                // Filter out empty lines or notice paragraphs
                if (!text) continue;
                if (/If you find any errors \(non-standard content/i.test(text)) continue;
                paragraphs.push(text);
            }
            return paragraphs.map(p => `<p>${p}</p>`).join("");
        }

        return container.text().trim();
    }
};
