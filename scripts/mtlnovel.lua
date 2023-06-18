local novelTitleElement = 'h1.entry-title'
local novelImageUrlElement = 'div.nov-head'
local novelDescriptionElement = 'div.desc'
local novelAuthorElement = 'td#author'
local novelGenresElement = 'td#genre'
local novelTagsElement = 'td#tags'
local novelStatusElement = 'td#status'
local chapterTextElement = 'div.par.fontsize-16'

function getChapterText(url)
	local document = lib:getDocument(url)
	local textDocument = document:selectFirst(chapterTextElement):select('p')

	return textDocument:toString()
end

function search(searchQuery)
    local url = 'https://www.mtlnovel.com/wp-admin/admin-ajax.php?action=autosuggest&q=' .. searchQuery
    local document = lib:getDocument(url)
    local tree = lib:toJsonTree(document:text())
    local items = lib:getFromJsonObject(tree, 'items')
    local first = lib:getFromObjectAsArray(items, 0)
    local results = lib:getFromElementAsObject(first, 'results')
    local array = lib:elementAsArray(results)

    local list = lib:createWebsiteSearchList()

    local size = array:size()
    if(size > 0) then
        for i=0,size-1,1 do
            local element = array:get(i)
            local searchResult = lib:elementAsObject(element)
            local link2 = searchResult:get('permalink')
			local title2 = lib:replaceString(searchResult:get('title'), '</strong>', '')
			local imgSrc2 = searchResult:get('thumbnail')

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

	websiteNovel:setTitle(documentNovel:selectFirst(novelTitleElement):text())
	websiteNovel:setImageUrl(documentNovel:selectFirst(novelImageUrlElement):selectFirst('amp-img'):absUrl('src'))
	websiteNovel:setDescription(documentNovel:selectFirst(novelDescriptionElement):text())
	websiteNovel:setAuthor(documentNovel:selectFirst(novelAuthorElement):text())
	websiteNovel:setGenres(documentNovel:selectFirst(novelGenresElement):text())
	websiteNovel:setTags(documentNovel:selectFirst(novelTagsElement):text())
	websiteNovel:setStatus(documentNovel:selectFirst(novelStatusElement):text())

    local chapterLink = documentNovel:selectFirst('a.view-all'):selectFirst('a[href]'):attr('abs:href')
    local documentChapters = lib:getDocument(chapterLink)
    local chaptersDiv = documentChapters:selectFirst('div.ch-list')
    
    local list = lib:createWebsiteChapterList()
    if(chaptersDiv ~= nil) then
        local chaptersIndex = chaptersDiv:select('p')
        local chaptersCount = chaptersIndex:size()

        if(chaptersCount > 0) then
            for i=0,chaptersCount-1,1 do
                local chapterLinks = chaptersIndex:get(i):select('a')
                local clSize = chapterLinks:size()
                for j=0,clSize-1,1 do
                    local link = chapterLinks:get(j):selectFirst('a[href]'):attr('abs:href')
                    local title = chapterLinks:get(j):text()
                    lib:addWebsiteChaptersToList(list, link, title, '')
                end
            end
        end
        lib:reverseList(list)
    end
	websiteNovel:setChapters(list)
	return websiteNovel
end