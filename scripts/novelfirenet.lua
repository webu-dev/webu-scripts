function getChapterText(url)
    local request = lib:getRequestBuilder():url(url):addHeader("referer", url):build()
    local result = lib:executeRequest(request, 'https://novelfire.net')
    local textElements = result:selectFirst('div#content'):select('p')
	return textElements:toString()
end

function search(searchQuery)
    local query = searchQuery:gsub('%s', '%%20')
	local url = 'https://novelfire.net/search?keyword=' .. query
	local request = lib:getRequestBuilder():url(url):addHeader("referer", 'https://novelfire.net/search'):build()
    local documentSearchResult = lib:executeRequest(request, 'novelfire.net'):select("li.novel-item")

	local list = lib:createWebsiteSearchList()
	local size = documentSearchResult:size()

	if(size > 0) then
		for i=0,size-1,1 do
			local link = documentSearchResult:get(i):selectFirst('a[href]'):attr('abs:href')
			local title = documentSearchResult:get(i):selectFirst('a[title]'):attr('title')
			local imgSrc = documentSearchResult:get(i):selectFirst('img'):absUrl('src')
			lib:addWebsiteSearchToList(list, link, title, imgSrc)
		end
	end
    return list
end

function parseNovel(url)
	local request = lib:getRequestBuilder():url(url):addHeader("referer", "https://novelfire.net/"):build()
	local doc = lib:executeRequest(request, 'https://novelfire.net/')

	local novel = lib:createWebsiteNovel()

	novel:setTitle(doc:selectFirst('div.main-head'):selectFirst('.novel-title'):text())
	novel:setImageUrl(doc:selectFirst('div.fixed-img'):selectFirst('img'):absUrl("data-src"))
	novel:setDescription(doc:selectFirst("div.summary"):select("p"):text())
	novel:setAuthor(doc:selectFirst('div.main-head'):selectFirst('div.author'):select('a[title]'):attr('title'))
	novel:setGenres(doc:selectFirst('div.categories'):select("li"):eachText():toString())
	novel:setStatus(doc:selectFirst('div.header-stats'):children():last():text())

	local requestChapters = lib:getRequestBuilder():url(url .. '/chapters'):addHeader("referer", "https://novelfire.net/"):build()
	local resultChapters = lib:executeRequest(requestChapters, 'https://novelfire.net/')

	local chapters = lib:createWebsiteChapterList()
	local hasNext = 1
	while hasNext==1 do
		local docChapters = resultChapters:select('ul.chapter-list'):select('li')
		local chaptersCount = docChapters:size()

		for i=0,chaptersCount-1,1 do
			local link = docChapters:get(i):selectFirst('a[href]'):attr('abs:href')
			local title = docChapters:get(i):selectFirst('a[href]'):attr('title')
			lib:addWebsiteChaptersToList(chapters, link, title, '')
		end

		local nextPage = ''
		local nextPageingElement = resultChapters:select('ul.pagination'):select("li"):last()

		if nextPageingElement == nil then

		else
			nextPageingElement = nextPageingElement:select('a[href]')
			if nextPageingElement == nil then

			else
				nextPage = nextPageingElement:attr('abs:href')
			end
		end

		if #nextPage > 0 then
			local nextChapters = lib:getRequestBuilder():url(nextPage):addHeader("referer", url .. '/chapters'):build()
			resultChapters = lib:executeRequest(nextChapters, 'https://novelfire.net/')
		else
			hasNext = 0
		end
	end

	novel:setChapters(chapters)

	return novel
end