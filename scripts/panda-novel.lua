function getChapterText(url)
    local request = lib:getRequestBuilder():url(url):addHeader("referer", url):build()
    local result = lib:executeRequest(request, 'https://www.panda-novel.com')
    local textElements = result:selectFirst('div#novelArticle2')
	local ads = textElements:getElementsByAttributeValueContaining("class", "novel-ins")
	ads:remove()
	return textElements:toString()
end

function search(searchQuery)
    local query = searchQuery:gsub('%s', '%%20')
    local url = 'https://www.panda-novel.com/search/' .. query
    local doc = lib:getDocument(url)
    local res = doc:select('li.novel-li')

    local list = lib:createWebsiteSearchList()
	local size = res:size()
	if(size > 0) then
		for i=0,size-1,1 do
			local link = res:get(i):selectFirst('a[href]'):attr('abs:href')
			local title = res:get(i):selectFirst('div.novel-desc'):child(0):text()
			local imgSrc = res:get(i):selectFirst('div.novel-cover'):child(0):attr('v-lazy:background-image'):gsub('\'', '')
			lib:addWebsiteSearchToList(list, link, title, imgSrc)
		end
	end
    return list
end

function parseNovel(url)
	local doc = lib:getDocument(url)
	local novel = lib:createWebsiteNovel()
	local id = url:match('(%d+)$')
	local api = 'https://www.panda-novel.com/api/book/chapters/' .. id

	novel:setTitle(doc:selectFirst('div.novel-desc'):child(0):text())
	novel:setImageUrl(doc:selectFirst('meta[property=og:image]'):attr("content"))
	novel:setDescription(doc:selectFirst("div.synopsis-content"):select("p"):text())
	novel:setAuthor(doc:selectFirst('div.novel-desc'):child(1):child(0):text())
	novel:setGenres(doc:selectFirst('div.novel-labels'):children():textNodes():toString():gsub('[%[%]]', ''))
	local tagsDoc = doc:selectFirst('ul.tags-list')
	if tagsDoc == nil then
		novel:setTags('')
	else
		novel:setTags(doc:selectFirst('ul.tags-list'):children():eachText():toString():gsub('[%[%]]', ''))
	end
	novel:setStatus(doc:select('ul.novel-labs'):get(1):child(1):child(0):text())

	local chapters = lib:createWebsiteChapterList()
	local hasNext = 1
	local cPage = 1
	while hasNext==1 do
		local cReq = lib:getRequestBuilder():url(api .. '/' .. cPage .. '?_=' .. (os.time() * 1000)):addHeader("referer", url .. '/chapters'):build()
		local cDoc = lib:executeRequest(cReq, 'https://www.panda-novel.com')
		local tree = lib:toJsonTree(cDoc:text())
		local data = lib:getFromJsonObject(tree, 'data')
		local list = lib:getFromJsonObject(data, 'list')
		local pages = data:get('pages'):getAsInt()
		local array = lib:elementAsArray(list)

		local size = array:size()
		for i=0,size-1,1 do
			local element = array:get(i)
			local item = lib:elementAsObject(element)
			local link = 'https://www.panda-novel.com/' .. item:get('chapterUrl'):getAsString()
			local title = item:get("name"):getAsString()
			lib:addWebsiteChaptersToList(chapters, link, title, '')
		end

		if cPage+1 > pages then
			hasNext = 0
		else
			cPage = cPage + 1
		end
	end
	novel:setChapters(chapters)
	return novel
end