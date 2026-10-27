/**
 * 动漫啦（www.dongman.la）漫画源
 *
 * 站点在 2026-10 改版为新的 HTML 结构：
 *   - 首页/搜索结果：a.comic-card（h3 标题、img 封面、span.cover-status 状态）
 *   - 搜索路由：/manhua/so/{关键词}/
 *   - 详情：/manhua/detail/{comicId}/
 *   - 章节：/manhua/chapter/{comicId}/{chapterId}/
 *   - 整话阅读：/manhua/chapter/{comicId}/{chapterId}/all.html（一次返回本章全部图片）
 *
 * @type {import('./_venera_.js')}
 */
class DongManLa extends ComicSource {
  name = "动漫啦"

  key = "dongman_la"

  version = "1.0.2"

  minAppVersion = "1.4.0"

  url = "https://cdn.jsdelivr.net/gh/hgnbh/sw@main/dongman_la_fixed_v101.js"

  get baseUrl() {
    return "https://www.dongman.la"
  }

  get headers() {
    return {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9",
      "Referer": this.baseUrl + "/",
    }
  }

  absoluteUrl(url) {
    if (!url) return ""
    if (url.startsWith("//")) return "https:" + url
    if (url.startsWith("/")) return this.baseUrl + url
    return url
  }

  comicIdFromHref(href) {
    if (!href) return null
    let match = href.match(/\/manhua\/detail\/(\d+)/)
    return match ? match[1] : null
  }

  /// 解析一张卡片（首页 / 搜索结果 / 推荐位）
  parseCard(el) {
    let link = el.localName === "a" ? el : el.querySelector("a[href*='/manhua/detail/']")
    if (!link) return null
    let id = this.comicIdFromHref(link.attributes["href"])
    if (!id) return null

    let title = (link.attributes["title"] || "").trim()
    let heading = link.querySelector("h3") || el.querySelector("h3")
    if (!title && heading) title = (heading.text || "").trim()

    let img = link.querySelector("img") || el.querySelector("img")
    let cover = ""
    if (img) cover = this.absoluteUrl(img.attributes["src"] || img.attributes["data-cover"] || "")

    let status = ""
    let statusEl = link.querySelector(".cover-status") || el.querySelector(".cover-status")
    if (statusEl) status = (statusEl.text || "").trim()

    return new Comic({
      id: id,
      title: title || `漫画 ${id}`,
      cover: cover,
      tags: status ? [status] : [],
      description: status,
    })
  }

  /// 通用列表解析
  parseList(html) {
    let document = new HtmlDocument(html)
    let comics = []
    let seen = {}
    for (let el of document.querySelectorAll("a.comic-card")) {
      let comic = this.parseCard(el)
      if (!comic || seen[comic.id]) continue
      seen[comic.id] = true
      comics.push(comic)
    }
    // 搜索页是普通列表项，兜底再扫一遍详情链接
    if (comics.length === 0) {
      for (let link of document.querySelectorAll("a[href*='/manhua/detail/']")) {
        let comic = this.parseCard(link)
        if (!comic || seen[comic.id]) continue
        seen[comic.id] = true
        comics.push(comic)
      }
    }
    return comics
  }

  explore = [
    {
      title: "动漫啦",
      type: "multiPartPage",
      load: async () => {
        let res = await Network.get(this.baseUrl + "/", this.headers)
        if (res.status !== 200) throw `Invalid status code: ${res.status}`
        let comics = this.parseList(res.body)
        return [{ title: "最新更新", comics: comics }]
      },
    },
  ]

  /// 搜索
  search = {
    load: async (keyword, options, page) => {
      let url = `${this.baseUrl}/manhua/so/${encodeURIComponent(keyword)}/`
      let res = await Network.get(url, this.headers)
      if (res.status !== 200) throw `Invalid status code: ${res.status}`
      return { comics: this.parseList(res.body), maxPage: 1 }
    },
    enableTagsSuggestions: false,
  }

  /// 漫画详情
  comic = {
    loadInfo: async (id) => {
      let res = await Network.get(`${this.baseUrl}/manhua/detail/${id}/`, this.headers)
      if (res.status !== 200) throw `Invalid status code: ${res.status}`
      let document = new HtmlDocument(res.body)

      let titleEl = document.querySelector("h1[itemprop='name']") || document.querySelector("h1")
      let title = titleEl ? (titleEl.text || "").trim() : `漫画 ${id}`

      let cover = ""
      let ogImage = document.querySelector("meta[property='og:image']")
      if (ogImage) cover = ogImage.attributes["content"] || ""
      if (!cover) {
        let img = document.querySelector("img[itemprop='image']")
        if (img) cover = img.attributes["src"] || ""
      }

      let descEl = document.querySelector("[itemprop='description']")
      let description = descEl ? (descEl.text || "").trim() : ""
      if (!description) {
        let metaDesc = document.querySelector("meta[name='description']")
        if (metaDesc) description = metaDesc.attributes["content"] || ""
      }

      // 章节列表
      let chapters = {}
      for (let link of document.querySelectorAll("a[href*='/manhua/chapter/']")) {
        let href = link.attributes["href"] || ""
        let match = href.match(/\/manhua\/chapter\/\d+\/(\d+)/)
        if (!match) continue
        let chapterId = match[1]
        if (chapters[chapterId]) continue
        let text = (link.text || "").trim()
        if (!text || text.indexOf("开始阅读") >= 0) continue
        chapters[chapterId] = text
      }
      if (Object.keys(chapters).length === 0) {
        chapters["first"] = "第 1 话"
      }

      return new ComicDetails({
        title: title,
        cover: this.absoluteUrl(cover),
        description: description,
        tags: {},
        chapters: chapters,
        url: `${this.baseUrl}/manhua/detail/${id}/`,
      })
    },

    loadEp: async (comicId, epId) => {
      let allUrl = `${this.baseUrl}/manhua/chapter/${comicId}/${epId}/all.html`
      let res = await Network.get(allUrl, this.headers)
      if (res.status !== 200) throw `Invalid status code: ${res.status}`

      let document = new HtmlDocument(res.body)
      let images = []
      let seen = {}
      for (let img of document.querySelectorAll("img")) {
        let src = img.attributes["src"] || img.attributes["data-src"] || ""
        if (src.indexOf("img.dongman.la/h/") < 0) continue
        let abs = this.absoluteUrl(src)
        if (seen[abs]) continue
        seen[abs] = true
        images.push(abs)
      }
      if (images.length === 0) throw "没有解析到本章图片"
      return { images: images }
    },

    onImageLoad: (url) => {
      return { headers: { "Referer": this.baseUrl + "/" } }
    },

    onThumbnailLoad: (url) => {
      return { headers: { "Referer": this.baseUrl + "/" } }
    },

    enableTagsTranslate: false,
  }
}
