function getChapterText(url)
	local document = lib:getDocument(url)
	local chapter = document:selectFirst('div#chapterText')
    chapter:select('a,script,.hidden,style,form,span'):remove()

    local textDocument = chapter:html()
	return textDocument
end

function search(searchQuery)
    local url = 'https://lightnovelreader.org/search/autocomplete?dataType=json&query=' .. searchQuery
    local document = lib:getDocument(url)

    local tree = lib:toJsonTree(document:text())
    local results = lib:getFromJsonObject(tree, "results")
    local array = lib:elementAsArray(results)

    local list = lib:createWebsiteSearchList()

    local size = array:size()

    if(size > 0) then
		for i=0,size-1,1 do
            local element = array:get(i)
            local searchResult = lib:elementAsObject(element)
            local link2 = searchResult:get('link')
			local title2 = searchResult:get('original_title')
			local imgSrc2 = searchResult:get('image')

            local link = lib:replaceString(link2, '"', '')
            local title = lib:replaceString(title2, '"', '')
            local imgSrc = lib:replaceString(imgSrc2, '"', '')

			lib:addWebsiteSearchToList(list, link, title, imgSrc)
		end
	end

	return list
end

function parseNovel(url)
	local documentNovel = lib:getDocument(url)
	local websiteNovel = lib:createWebsiteNovel()

	websiteNovel:setTitle(documentNovel:selectFirst('h2.novel-title'):text())
	websiteNovel:setImageUrl(documentNovel:selectFirst('div.novels-detail'):selectFirst('img'):absUrl('src'))
	websiteNovel:setDescription(documentNovel:select('div.empty-box'):get(1):select('p'):text())
	websiteNovel:setAuthor(documentNovel:selectFirst('div.novels-detail-right'):select('li'):get(5):child(1):text())
	websiteNovel:setGenres(documentNovel:selectFirst('div.novels-detail-right'):select('li'):get(2):child(1):text())
	websiteNovel:setTags('')
	websiteNovel:setStatus(documentNovel:selectFirst('div.novels-detail-right'):select('li'):get(1):child(1):text())

    local volumes = documentNovel:select('a.novels-detail-chapters-btn')
    local volumesCount = volumes:size()
    local list = lib:createWebsiteChapterList()

    for i=0,volumesCount-1,1 do
        local chapters = documentNovel:select('div.novels-detail-chapters'):get(i):select('li')
        local chapterSize = chapters:size()
        for j=0,chapterSize-1,1 do
            local link = chapters:get(j):selectFirst('a[href]'):attr('abs:href')
            local title = volumes:get(i):text() .. ' | ' .. chapters:get(j):selectFirst('a[href]'):text()
            lib:addWebsiteChaptersToList(list, link, title, '')
        end
    end

    lib:reverseList(list)
    websiteNovel:setChapters(list)

	return websiteNovel
end