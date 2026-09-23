function getChapterText(url)
	local document = lib:getDocument(url)
	local textDocument = document:selectFirst('div#chr-content'):select('p')

	return textDocument:toString()
end

function search(searchQuery)
	local url = 'https://novlove.com/search?keyword=' .. searchQuery
	local document = lib:getDocument(url)
	local documentSearchResult = document:selectFirst('div#list-page'):selectFirst('div.list'):select('div.row')

	local list = lib:createWebsiteSearchList()

	local searchCount = documentSearchResult:size()
	if(searchCount > 0) then
		for i=0,searchCount-1,1 do
			local link = documentSearchResult:get(i):selectFirst('a[href]'):attr('abs:href')
			local title = documentSearchResult:get(i):selectFirst('a[href]'):attr('title')
			local imgSrc = documentSearchResult:get(i):selectFirst('img'):absUrl('src')
			lib:addWebsiteSearchToList(list, link, title, imgSrc)
		end
	end

	return list
end

function parseNovel(url)
	--[[get info from novels page--]]
	local documentNovel = lib:getDocument(url)
	local websiteNovel = lib:createWebsiteNovel()

	websiteNovel:setTitle(documentNovel:selectFirst('h3.title'):text())
	websiteNovel:setImageUrl(documentNovel:selectFirst('div.book'):selectFirst('img'):absUrl('data-src'))
	websiteNovel:setDescription(documentNovel:selectFirst('div.desc-text'):text())

	websiteNovel:setAuthor(documentNovel:select('ul.info'):select('li'):get(0):select('a[href]'):text())
	websiteNovel:setGenres(documentNovel:select('ul.info'):select('li'):get(1):select('a[href]'):text())
	websiteNovel:setTags(documentNovel:select('ul.info'):select('li'):get(3):select('a[href]'):text())

	local status = documentNovel:select('ul.info'):select('li'):get(0):select('a[href]')
	if status == nil then
		websiteNovel:setStatus('')
	else
		websiteNovel:setStatus(status:text())
	end

	--[[get chapters list from ajax request]]
    local request = lib:getRequestBuilder():url('https://novlove.com/ajax/chapter-archive?novelId=' .. documentNovel:select('div#rating'):attr('data-novel-id')):addHeader("accept", "*/*")
	:addHeader("dnt", "1"):addHeader("referer", url)
	:addHeader("x-requested-with", "XMLHttpRequest"):get():build()
	local result = lib:executeRequest(request, 'https://www.novlove.com')
	local chaptersIndex = result:select('li')

	local list = lib:createWebsiteChapterList()
	local chaptersCount = chaptersIndex:size()

	if(chaptersCount > 0) then
		for i=0,chaptersCount-1,1 do
			local link = chaptersIndex:get(i):selectFirst('a[href]'):attr('abs:href')
			local title = chaptersIndex:get(i):selectFirst('a'):text()
			lib:addWebsiteChaptersToList(list, link, title, '')
		end
	end

	websiteNovel:setChapters(list)

	return websiteNovel
end