function getChapterText(url)
	local document = lib:getDocument(url)
	local textDocument = document:selectFirst('div#chr-content'):select('p')

	return textDocument:toString()
end

function search(searchQuery)
	local url = 'https://readnovelfull.com/novel-list/search?keyword=' .. searchQuery
	local document = lib:getDocument(url)
	local documentSearchResult = document:selectFirst('div#list-page'):selectFirst('div.list'):select('div.row')

	local list = lib:createWebsiteSearchList()

	local searchCount = documentSearchResult:size()
	if(searchCount > 0) then
		for i=0,searchCount-1,1 do
			local link = documentSearchResult:get(i):selectFirst('a[href]'):attr('abs:href')
			local title = documentSearchResult:get(i):selectFirst('a[href]'):attr('title')
			local imgSrc = documentSearchResult:get(i):selectFirst('img'):attr('abs:src')
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
	websiteNovel:setImageUrl(documentNovel:selectFirst('div.books'):selectFirst('img'):absUrl('src'))
	websiteNovel:setDescription(documentNovel:selectFirst('div.desc-text'):text())
	websiteNovel:setAuthor(documentNovel:selectFirst('ul.info.info-meta'):selectFirst('a[href]'):text())
	websiteNovel:setGenres(documentNovel:selectFirst('ul.info.info-meta'):child(1):select('a[href]'):text())
	websiteNovel:setTags('')
    websiteNovel:setStatus(documentNovel:selectFirst('ul.info.info-meta'):child(3):select('a[href]'):text())

    local novelId = documentNovel:selectFirst('div#rating'):attr('data-novel-id')

	local documentChapters = lib:postDocument('https://readnovelfull.com/ajax/chapter-archive?novelId=' .. novelId)
	local chaptersIndex = documentChapters:select('div.row'):select('a[href]')

	local list = lib:createWebsiteChapterList()
	local chaptersCount = chaptersIndex:size()

	if(chaptersCount > 0) then
		for i=0,chaptersCount-1,1 do
			local link = chaptersIndex:get(i):attr('abs:href')
			local title = chaptersIndex:get(i):attr('title')
			lib:addWebsiteChaptersToList(list, link, title, '')
		end
	end

	websiteNovel:setChapters(list)

	return websiteNovel
end