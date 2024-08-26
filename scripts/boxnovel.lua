local novelTitleElement = 'div.post-title'
local novelImageUrlElement = 'div.summary_image'
local novelDescriptionElement = 'div.description-summary'
local novelAuthorElement = 'div.author-content'
local novelGenresElement = 'div.genres-content'
local novelTagsElement = 'div.tags-content'
local novelStatusElement = 'div.post-status'
local novelStatusContentElement = 'div.summary-content'
local chapterListElement = 'li.wp-manga-chapter'
local searchNovelsElement = 'div.c-tabs-item__content'
local chapterTextElement = 'div.c-blog-post'

local ajaxChapterRelativeUrl = 'ajax/chapters/'

function getChapterText(url)
	local document = lib:getDocument(url)
	local textDocument = document:selectFirst(chapterTextElement):selectFirst('div.text-left'):select('p')

	return textDocument:toString()
end

function search(searchQuery)
	local url = 'https://boxnovel.com/?s=' .. searchQuery .. '&post_type=wp-manga'
	local document = lib:getDocument(url)
	local documentSearchResult = document:select(searchNovelsElement)

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

	websiteNovel:setTitle(documentNovel:selectFirst(novelTitleElement):text())
	websiteNovel:setImageUrl(documentNovel:selectFirst(novelImageUrlElement):selectFirst('img'):absUrl('src'))
	websiteNovel:setDescription(documentNovel:selectFirst(novelDescriptionElement):text())
	websiteNovel:setAuthor(documentNovel:selectFirst(novelAuthorElement):text())
	websiteNovel:setGenres(documentNovel:selectFirst(novelGenresElement):text())
	websiteNovel:setTags(documentNovel:selectFirst(novelTagsElement):text())

	if documentNovel:selectFirst(novelStatusElement):select(novelStatusContentElement):last() == nil then
		websiteNovel:setStatus(documentNovel:selectFirst(novelStatusElement):selectFirst(novelStatusContentElement):text())
	else
		websiteNovel:setStatus(documentNovel:selectFirst(novelStatusElement):select(novelStatusContentElement):last():text())
	end

	--[[get chapters list from ajax request]]
	local documentChapters = lib:postDocument(url .. ajaxChapterRelativeUrl)
	local chaptersIndex = documentChapters:select(chapterListElement)

	local list = lib:createWebsiteChapterList()
	local chaptersCount = chaptersIndex:size()

	if(chaptersCount > 0) then
		for i=0,chaptersCount-1,1 do
			local link = chaptersIndex:get(i):selectFirst('a[href]'):attr('abs:href')
			local title = chaptersIndex:get(i):selectFirst('a'):text()
			lib:addWebsiteChaptersToList(list, link, title, '')
		end
	end

	lib:reverseList(list)
	websiteNovel:setChapters(list)

	return websiteNovel
end