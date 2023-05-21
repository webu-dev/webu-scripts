function getChapterText(url)
	local document = lib:getDocument(url)
	local textDocument = document:selectFirst('div#chapter-content'):select('p')

	local text = textDocument:toString()
	return text
end

function search(searchQuery)
	local url = 'https://novelfull.com/search?keyword=' .. searchQuery
	local document = lib:getDocument(url)
	local documentSearchResult = document:selectFirst('#list-page'):selectFirst('div.list'):select('div.row')

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
	--get info from novels page
	local documentNovel = lib:getDocument(url):select('div#truyen')
	local websiteNovel = lib:createWebsiteNovel()

	websiteNovel:setTitle(documentNovel:select('div.desc'):first():text())
	websiteNovel:setImageUrl(documentNovel:select('div.book'):select('img'):first():absUrl('src'))
	websiteNovel:setDescription(documentNovel:select('div.desc-text'):first():text())

	local docAuthor = documentNovel:select('div.info'):select('div'):get(1)
	docAuthor:select('h3'):remove()
	websiteNovel:setAuthor(docAuthor:text())

	local docGenres = documentNovel:select('div.info'):select('div'):get(2)
	docGenres:select('h3'):remove()
	websiteNovel:setGenres(documentNovel:select('div.info'):select('div'):get(2):text())
	--no tags
	websiteNovel:setTags('')

	local docStatus = documentNovel:select('div.info'):select('div'):get(4)
	docStatus:select('h3'):remove()
	websiteNovel:setStatus(docStatus:text())

	local list = lib:createWebsiteChapterList()

	local hasNext = 1
	while hasNext==1 do
		local docChapters = documentNovel:select('ul.list-chapter'):select('li')
		local chaptersCount = docChapters:size()

		for i=0,chaptersCount-1,1 do
			local link = docChapters:get(i):selectFirst('a[href]'):attr('abs:href')
			local title = docChapters:get(i):selectFirst('a[href]'):attr('title')
			lib:addWebsiteChaptersToList(list, link, title, '')
		end

		local nextPage = ''
		local nextPageingElement = documentNovel:select('ul.pagination.pagination-sm'):first()

		if nextPageingElement == nil then

		else
			nextPageingElement = nextPageingElement:select('li.next'):first():select('a[href]'):first()
			if nextPageingElement == nil then

			else
				nextPage = nextPageingElement:attr('abs:href')
			end
		end

		if #nextPage > 0 then
			documentNovel = lib:getDocument(nextPage)
		else
			hasNext = 0
		end
	end

	websiteNovel:setChapters(list)
	return websiteNovel
end