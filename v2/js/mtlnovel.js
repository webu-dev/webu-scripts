/**
 * Source script for mtlnovel.me
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
        const pageNum = Math.max(1, parseInt(page, 10) || 1);
        const searchUrl = `https://mtlnovel.me/search/?keyword=${encodeURIComponent(trimmed)}&page=${pageNum}`;

        let resp = await http.get(searchUrl);
        if ((!resp || resp.status !== 200) && (!resp || resp.status === 429 || resp.status >= 500)) {
            resp = await http.get(searchUrl);
        }

        const results = [];
        const seenLinks = new Set();
        if (resp && resp.status === 200 && resp.body) {
            const $ = parseHtml(resp.body);
            const items = $(".novel-list .novel-box, .novel-box");

            for (const item of items) {
                const a = item.first(".title a, h3 a, a[href*='/info/']");
                if (!a) continue;

                let href = a.attr("href");
                if (!href) continue;

                let link = href;
                if (link.startsWith("//")) {
                    link = `https:${link}`;
                } else if (!link.startsWith("http")) {
                    link = `https://mtlnovel.me${link.startsWith("/") ? "" : "/"}${link}`;
                }

                if (seenLinks.has(link)) continue;

                let title = a.text().trim() || a.attr("title")?.trim() || "";
                if (!title) {
                    const titleEl = item.first(".title, h3");
                    if (titleEl) {
                        title = titleEl.text().trim();
                    }
                }
                if (!title) {
                    const img = item.first("img");
                    if (img) {
                        const alt = img.attr("alt")?.trim() || "";
                        title = alt.replace(/\s+poster$/i, "").trim();
                    }
                }

                const img = item.first("img");
                let imgSrc = img ? (img.attr("src") || img.attr("data-src") || "") : "";
                if (imgSrc) {
                    if (imgSrc.startsWith("//")) {
                        imgSrc = `https:${imgSrc}`;
                    } else if (!imgSrc.startsWith("http")) {
                        imgSrc = `https://mtlnovel.me${imgSrc.startsWith("/") ? "" : "/"}${imgSrc}`;
                    }
                }

                if (title && link) {
                    seenLinks.add(link);
                    results.push({ title, link, imgSrc });
                }
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

        let cleanUrl = novelUrl.trim();
        if (cleanUrl.startsWith("//")) {
            cleanUrl = `https:${cleanUrl}`;
        } else if (!cleanUrl.startsWith("http")) {
            cleanUrl = `https://mtlnovel.me${cleanUrl.startsWith("/") ? "" : "/"}${cleanUrl}`;
        }

        let resp = await http.get(cleanUrl);
        if ((!resp || resp.status !== 200) && (!resp || resp.status === 429 || resp.status >= 500)) {
            resp = await http.get(cleanUrl);
        }
        if (!resp || resp.status !== 200 || !resp.body) {
            throw new Error(`Failed to load novel page: HTTP ${resp ? resp.status : "unknown"}`);
        }

        const $ = parseHtml(resp.body);

        // Title
        let title = $("article h5.m-card-header, h5.m-card-header, .m-card-header, h1").first()?.text().trim() || "";
        if (!title) {
            const ogTitle = $("meta[property='og:title']").attr("content");
            if (ogTitle) {
                title = ogTitle.replace(/\s*RAW English Translation.*$/i, "").replace(/^Read\s+/i, "").trim();
            }
        }

        // Cover Image
        let imageUrl = $(".content-main-image img, .content-main-image-wrapper img, img[itemprop='image']").first()?.attr("src") ||
                       $(".content-main-image img, .content-main-image-wrapper img, img[itemprop='image']").first()?.attr("data-src") || "";
        if (!imageUrl) {
            imageUrl = $("meta[property='og:image']").attr("content") || "";
        }
        if (imageUrl) {
            if (imageUrl.startsWith("//")) {
                imageUrl = `https:${imageUrl}`;
            } else if (!imageUrl.startsWith("http")) {
                imageUrl = `https://mtlnovel.me${imageUrl.startsWith("/") ? "" : "/"}${imageUrl}`;
            }
        }

        // Author
        let author = $("a[href*='/author/']").first()?.text().trim() || "";
        if (!author) {
            const lis = $("ul li");
            for (const li of lis) {
                const text = li.text();
                if (/Author:/i.test(text)) {
                    author = text.replace(/Author:\s*/i, "").trim();
                    break;
                }
            }
        }
        if (!author) {
            author = $("meta[name='author']").attr("content") || "";
        }

        // Status
        let status = $("a[href*='status='], a[href*='/list/?status=']").first()?.text().trim() || "";
        if (!status) {
            const lis = $("ul li");
            for (const li of lis) {
                const text = li.text();
                if (/Status:/i.test(text)) {
                    status = text.replace(/Status:\s*/i, "").trim();
                    break;
                }
            }
        }
        if (/completed/i.test(status)) {
            status = "Completed";
        } else if (/ongoing/i.test(status)) {
            status = "Ongoing";
        }

        // Genres
        const genreElements = $("article a[href*='/category/'], a[href*='/category/']");
        const genres = Array.from(new Set(
            genreElements.map(el => el.text().trim()).filter(Boolean)
        )).join(", ");

        // Tags
        const tagElements = $("article a[href*='/tag/'], a[href*='/tag/']");
        const tags = Array.from(new Set(
            tagElements.map(el => el.text().trim()).filter(Boolean)
        )).join(", ");

        // Description
        let description = "";
        const summaryCard = $(".m-card.text-break").first();
        if (summaryCard) {
            summaryCard.remove(".m-card-header, h5");
            const raw = summaryCard.html();
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
                description = summaryCard.text().trim();
            }
        }
        if (!description) {
            description = $("meta[name='description']").attr("content") || "";
        }
        description = description.replace(/^Novel Summary\s*/i, "").trim();

        // Chapters: extracted via AJAX endpoint
        const chapters = [];
        const seenChapterLinks = new Set();

        let slug = "";
        const slugMatch = cleanUrl.match(/\/(?:info|read)\/([^/?#]+)/);
        if (slugMatch) {
            slug = slugMatch[1];
        }
        if (!slug) {
            const scriptMatch = resp.body.match(/\/ajax\/chapters\/\?slug=([a-zA-Z0-9_-]+)/);
            if (scriptMatch) {
                slug = scriptMatch[1];
            }
        }
        if (!slug) {
            const canonical = $("link[rel='canonical']").attr("href") || $("meta[property='og:url']").attr("content") || "";
            const canMatch = canonical.match(/\/(?:info|read)\/([^/?#]+)/);
            if (canMatch) {
                slug = canMatch[1];
            }
        }
        if (!slug) {
            const queryMatch = cleanUrl.match(/[?&]slug=([a-zA-Z0-9_-]+)/);
            if (queryMatch) {
                slug = queryMatch[1];
            }
        }

        if (slug) {
            const chaptersUrl = `https://mtlnovel.me/ajax/chapters/?slug=${slug}`;
            try {
                let chResp = await http.get(chaptersUrl);
                if ((!chResp || chResp.status !== 200) && (!chResp || chResp.status === 429 || chResp.status >= 500)) {
                    chResp = await http.get(chaptersUrl);
                }
                if (chResp && chResp.status === 200 && chResp.body) {
                    const $ch = parseHtml(chResp.body);
                    const links = $ch(".update-box-chapter a, #list-chapters a, .chapter-group a");
                    for (const a of links) {
                        let href = a.attr("href");
                        if (!href || (!href.includes("/read/") && !href.includes("/chapter-"))) continue;

                        let link = href;
                        if (link.startsWith("//")) {
                            link = `https:${link}`;
                        } else if (!link.startsWith("http")) {
                            link = `https://mtlnovel.me${link.startsWith("/") ? "" : "/"}${link}`;
                        }

                        if (seenChapterLinks.has(link)) continue;
                        seenChapterLinks.add(link);

                        let chTitle = a.attr("title")?.trim() || a.text().trim();
                        if (!chTitle) {
                            const m = link.match(/\/chapter-([^/?#]+)/);
                            chTitle = m ? `Chapter ${m[1].replace(/-/g, " ")}` : "Chapter";
                        }

                        chapters.push({
                            title: chTitle,
                            link,
                            text: ""
                        });
                    }
                }
            } catch (e) {
                console.warn("Failed to fetch chapters for slug " + slug + ": " + e.message);
            }
        }

        // Fallback: if no chapters found via ajax, inspect overview page directly
        if (chapters.length === 0) {
            const links = $(".update-box-chapter a, #list-chapters a, .chapter-group a");
            for (const a of links) {
                let href = a.attr("href");
                if (!href || (!href.includes("/read/") && !href.includes("/chapter-"))) continue;

                let link = href;
                if (link.startsWith("//")) {
                    link = `https:${link}`;
                } else if (!link.startsWith("http")) {
                    link = `https://mtlnovel.me${link.startsWith("/") ? "" : "/"}${link}`;
                }

                if (seenChapterLinks.has(link)) continue;
                seenChapterLinks.add(link);

                let chTitle = a.attr("title")?.trim() || a.text().trim();
                if (!chTitle) {
                    const m = link.match(/\/chapter-([^/?#]+)/);
                    chTitle = m ? `Chapter ${m[1].replace(/-/g, " ")}` : "Chapter";
                }

                chapters.push({
                    title: chTitle,
                    link,
                    text: ""
                });
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

        let cleanUrl = chapterUrl.trim();
        if (cleanUrl.startsWith("//")) {
            cleanUrl = `https:${cleanUrl}`;
        } else if (!cleanUrl.startsWith("http")) {
            cleanUrl = `https://mtlnovel.me${cleanUrl.startsWith("/") ? "" : "/"}${cleanUrl}`;
        }

        let resp = await http.get(cleanUrl);
        if ((!resp || resp.status !== 200) && (!resp || resp.status === 429 || resp.status >= 500)) {
            resp = await http.get(cleanUrl);
        }
        if (!resp || resp.status !== 200 || !resp.body) {
            throw new Error(`Failed to load chapter page: HTTP ${resp ? resp.status : "unknown"}`);
        }

        const $ = parseHtml(resp.body);
        const container = $(".content.text-break, .content, article .content").first();
        if (!container) {
            return "";
        }

        // Remove boilerplate, ads, navigation, notice elements
        container.remove("script, ins, style, .chapter-nav, .ads, .ad, noscript, iframe");

        const pElements = container.select("p");
        if (pElements.length > 0) {
            const paragraphs = [];
            for (const p of pElements) {
                const text = p.text().trim();
                if (!text) continue;
                paragraphs.push(text);
            }
            if (paragraphs.length > 0) {
                return paragraphs.join("\n\n");
            }
        }

        const rawHtml = container.html();
        if (rawHtml) {
            return rawHtml
                .replace(/<br\s*\/?>/gi, "\n")
                .replace(/<\/p>/gi, "\n\n")
                .replace(/<[^>]+>/g, "")
                .replace(/&nbsp;/gi, " ")
                .replace(/&amp;/gi, "&")
                .replace(/&lt;/gi, "<")
                .replace(/&gt;/gi, ">")
                .replace(/&quot;/gi, '"')
                .replace(/&#39;/gi, "'")
                .split("\n")
                .map(line => line.trim())
                .filter(Boolean)
                .join("\n\n");
        }

        return container.text().trim();
    }
};
