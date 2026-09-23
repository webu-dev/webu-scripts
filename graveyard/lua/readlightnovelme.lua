function getChapterText(url)
	local document = lib:getDocument(url)
	local chapter = document:selectFirst('div.desc'):select('p')
	return chapter:toString()
end

function search(searchQuery)
    local contentLength = string.len(tostring(searchQuery))
    local body = lib:getFormBuilder():addFormDataPart('q', searchQuery):build()
    local request = lib:getRequestBuilder():url('https://www.readlightnovel.meme/search/autocomplete')
    :addHeader("content-length", tostring(contentLength+2))
	:addHeader("content-type", "application/x-www-form-urlencoded; charset=UTF-8")
    :addHeader("origin", "https://www.readlightnovel.meme")
    :addHeader("referer", "https://www.readlightnovel.meme/hub141222")
    :addHeader("X-Requested-With", "XMLHttpRequest")
    :post(body)
    :build()
    local result = lib:executeRequest(request, 'https://www.readlightnovel.meme')
    local decoded = lib:decodeUnicode(result:toString())

    local chapterList = lib:jsoupParseHtml(decoded, 'https://www.readlightnovel.meme'):select('li')
    local size = chapterList:size()
	local list = lib:createWebsiteSearchList()

    if(size > 0) then
		for i=0,size-1,1 do
            local element = chapterList:get(i):selectFirst('a')
            local link = element:attr('href');
            local cover = element:selectFirst('img'):attr('src');
            local title = element:selectFirst("span.title"):text();
			lib:addWebsiteSearchToList(list, link, title, cover)
		end
	end

	return list
end

function parseNovel(url)
	local documentNovel = lib:getDocument(url)
	local websiteNovel = lib:createWebsiteNovel()
    local list = lib:createWebsiteChapterList()

	websiteNovel:setTitle(documentNovel:selectFirst('div.block-title'):text())
	websiteNovel:setImageUrl(documentNovel:selectFirst('div.novel-cover'):selectFirst('img'):absUrl('src'))
	websiteNovel:setDescription(documentNovel:select('div.novel-detail-body'):get(8):select('p'):text())
	websiteNovel:setAuthor(documentNovel:select('div.novel-detail-body'):get(4):text())
	websiteNovel:setGenres(documentNovel:select('div.novel-detail-body'):get(1):select('li'):eachText():toString():gsub('[%[%]]', ''))
	websiteNovel:setTags(documentNovel:select('div.novel-detail-body'):get(2):select('li'):eachText():toString():gsub('[%[%]]', ''))
	websiteNovel:setStatus(documentNovel:select('div.novel-detail-body'):get(7):text())

	local chaptersIndex = documentNovel:select('ul.chapter-chs'):select("li")
	local chaptersCount = chaptersIndex:size()

	if(chaptersCount > 0) then
		for i=0,chaptersCount-1,1 do
			local link = chaptersIndex:get(i):selectFirst('a[href]'):attr('abs:href')
			local title = chaptersIndex:get(i):text()
			lib:addWebsiteChaptersToList(list, link, title, '')
		end
	end

    websiteNovel:setChapters(list)
	return websiteNovel
end