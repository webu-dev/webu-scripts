function getChapterText(url)
	local document = lib:getDocument(url)
	local textDocument = document:selectFirst('div#chr-content'):select('p')

	local text = textDocument:toString()
	return text
end

function search(searchQuery)
	local url = 'https://novelbin.me/search?keyword=' .. searchQuery
	local document = lib:getDocument(url)
	local documentSearchResult = document:selectFirst('#list-page'):selectFirst('div.list'):select('div.row')

	local list = lib:createWebsiteSearchList()

	local searchCount = documentSearchResult:size()
	if(searchCount > 0) then
		for i=0,searchCount-1,1 do
			local link = documentSearchResult:get(i):selectFirst('a[href]'):attr('abs:href')
			local title = documentSearchResult:get(i):selectFirst('a[href]'):attr('title')
			local imgSrc = documentSearchResult:get(i):select('img'):attr('abs:src')
			lib:addWebsiteSearchToList(list, link, title, imgSrc)
		end
	end

	return list
end

function parseNovel(url)
	--[[get info from novels page--]]
	local documentNovel = lib:getDocument(url):select('div#novel')
	local websiteNovel = lib:createWebsiteNovel()

	websiteNovel:setTitle(documentNovel:select('h3.title'):first():text())
	websiteNovel:setImageUrl(documentNovel:select('div.book'):select('img'):attr('abs:data-src'))
	websiteNovel:setDescription(documentNovel:select('div.desc-text'):first():text())

	local docAuthor = documentNovel:select('ul.info'):select('li'):get(0)
	docAuthor:select('h3'):remove()
	websiteNovel:setAuthor(docAuthor:text())

	local docGenres = documentNovel:select('ul.info'):select('li'):get(1)
	docGenres:select('h3'):remove()
	websiteNovel:setGenres(docGenres:text())
	--[[no tags--]]
	websiteNovel:setTags('')

	local docStatus = documentNovel:select('ul.info'):select('li'):get(2)
	docStatus:select('h3'):remove()
	websiteNovel:setStatus(docStatus:text())

	local list = lib:createWebsiteChapterList()

	--[[get chapters list from ajax request]]
    local dataId = documentNovel:select("div#rating"):first():attr("data-novel-id")
	local result = lib:getDocument("https://novelbin.me/ajax/chapter-archive?novelId=" .. dataId)
	local chaptersIndex = result:select("li")

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