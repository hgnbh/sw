/**
 * HentaiFox / IMHentai 系列同人画廊源
 *
 * 这几个站点（hentaifox / imhentai / hentaiera / hentairox / hentaienvy / hentaizap）
 * 共用同一套程序与页面结构：画廊页 /gallery/{id}/，图片地址与页数从页面内嵌数据读取。
 * 一个画廊 = 一部漫画，画廊内的所有图片 = 章节。
 *
 * @type {import('./_venera_.js')}
 */
class HentaiFoxSource extends ComicSource {
  name = "HentaiFox 系列"

  key = "hentaifox"

  version = "1.0.0"

  minAppVersion = "1.4.0"

  url = "https://cdn.jsdelivr.net/gh/HGNBH/my-venera-sources@main/hentaifox.js"

  settings = {
    domain: {
      title: "站点",
      type: "select",
      options: [
        { value: "https://hentaifox.com", text: "hentaifox.com" },
        { value: "https://imhentai.xxx", text: "imhentai.xxx" },
        { value: "https://hentaiera.com", text: "hentaiera.com" },
        { value: "https://hentairox.com", text: "hentairox.com" },
        { value: "https://hentaienvy.com", text: "hentaienvy.com" },
        { value: "https://hentaizap.com", text: "hentaizap.com" },
      ],
      default: "https://hentaifox.com",
    },
  }

  get baseUrl() {
    let domain = this.loadSetting("domain") || "https://hentaifox.com"
    return domain.replace(/\/+$/, "")
  }

  get headers() {
    return {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9,zh-CN;q=0.8",
      "Referer": this.baseUrl + "/",
    }
  }

  absoluteUrl(url) {
    if (!url) return ""
    if (url.startsWith("//")) return "https:" + url
    if (url.startsWith("/")) return this.baseUrl + url
    return url
  }

  /// 从任意链接里取出画廊 id
  galleryIdFromHref(href) {
    if (!href) return null
    let match = href.match(/\/gallery\/(\d+)/)
    return match ? match[1] : null
  }

  /// 解析列表页里的画廊（首页 / 搜索结果 / 标签页）
  parseList(html) {
    let document = new HtmlDocument(html)
    let comics = []
    let seen = {}

    let links = document.querySelectorAll('a[href*="/gallery/"]')
    for (let link of links) {
      let id = this.galleryIdFromHref(link.attributes["href"])
      if (!id || seen[id]) continue

      // 封面和标题：优先找链接里的图片，其次找同级容器里的图片
      let img = link.querySelector("img")
      if (!img && link.parent) img = link.parent.querySelector("img")

      let cover = img ? img.attributes["data-src"] || img.attributes["src"] || "" : ""
      let title = ""
      if (img) title = (img.attributes["alt"] || "").trim()
      if (!title) title = (link.attributes["title"] || "").trim()
      if (!title) {
        let heading = link.querySelector("h1, h2, h3, h4, .title")
        if (heading) title = (heading.text || "").trim()
      }

      // 没有封面的多半是导航链接，跳过
      if (!cover && !title) continue

      seen[id] = true
      comics.push(
        new Comic({
          id: id,
          title: title || `Gallery ${id}`,
          cover: this.absoluteUrl(cover),
          tags: [],
          description: "",
        })
      )
    }
    return comics
  }

  /// 解析页数（这些站点的翻页链接通常带 page-link class）
  parseMaxPage(document, page) {
    let maxPage = page
    for (let link of document.querySelectorAll("a.page-link, .pagination a")) {
      let href = link.attributes["href"] || ""
      let match = href.match(/[?&]page=(\d+)/)
      if (match) {
        let n = parseInt(match[1])
        if (!isNaN(n) && n > maxPage) maxPage = n
      }
      let text = (link.text || "").trim()
      if (/^\d+$/.test(text)) {
        let n = parseInt(text)
        if (!isNaN(n) && n > maxPage) maxPage = n
      }
    }
    return maxPage
  }

  /// 画廊里的标签信息，形如 <li>Tags: <a>…</a></li>
  parseTags(document) {
    let tags = {}
    let items = document.querySelectorAll("ul.galleries_info li")
    for (let item of items) {
      let text = (item.text || "").trim()
      let match = text.match(/^([A-Za-z ]+?)\s*:/)
      if (!match) continue
      let label = match[1].trim()
      if (!label) continue
      let values = []
      for (let a of item.querySelectorAll("a")) {
        let value = (a.text || "").trim()
        if (value) values.push(value)
      }
      if (values.length > 0) tags[label] = values
    }
    return tags
  }

  /// 从画廊页里解析出所有图片地址
  parseImages(html, document) {
    let images = []
    let base = ""

    let firstImage = document.querySelector("img[data-src]") || document.querySelector("img[src]")
    if (firstImage) {
      let raw = firstImage.attributes["data-src"] || firstImage.attributes["src"] || ""
      let abs = this.absoluteUrl(raw)
      let index = abs.lastIndexOf("/")
      if (index > 0) base = abs.slice(0, index + 1)
    }

    let extMap = { j: "jpg", p: "png", g: "gif", w: "webp", a: "avif" }

    // 页面内嵌的页数据：$.parseJSON('{"1":"j,800,1200", ...}')
    let match = html.match(/\$\.parseJSON\('([^']+)'\)/)
    if (match) {
      try {
        let data = JSON.parse(match[1])
        let keys = Object.keys(data).sort((a, b) => parseInt(a) - parseInt(b))
        for (let key of keys) {
          let parts = String(data[key]).split(",")
          let ext = extMap[parts[0]] || "jpg"
          if (base) images.push(base + key + "." + ext)
        }
      } catch (e) {
        console.warn("parse gallery data failed", e)
      }
    }

    // 兜底：页面上的 load_pages 数量
    if (images.length === 0) {
      let countEl = document.getElementById("load_pages")
      let count = countEl ? parseInt(countEl.attributes["value"] || "0") : 0
      if (!isNaN(count) && count > 0 && base) {
        for (let i = 1; i <= count; i++) images.push(base + i + ".jpg")
      }
    }

    // 再兜底：直接收集页面里的缩略图原图
    if (images.length === 0) {
      for (let img of document.querySelectorAll("img[data-src]")) {
        let src = this.absoluteUrl(img.attributes["data-src"] || "")
        if (src && images.indexOf(src) < 0) images.push(src)
      }
    }

    return images
  }

  // 发现页
  explore = [
    {
      title: "最新画廊",
      type: "multiPageComicList",
      load: async (page) => {
        let url = page > 1 ? `${this.baseUrl}/?page=${page}` : `${this.baseUrl}/`
        let res = await Network.get(url, this.headers)
        if (res.status !== 200) throw `Invalid status code: ${res.status}`
        let document = new HtmlDocument(res.body)
        return {
          comics: this.parseList(res.body),
          maxPage: this.parseMaxPage(document, page),
        }
      },
    },
  ]

  /// 搜索
  search = {
    load: async (keyword, options, page) => {
      let url = `${this.baseUrl}/search/?key=${encodeURIComponent(keyword)}&page=${page}`
      let res = await Network.get(url, this.headers)
      if (res.status !== 200) throw `Invalid status code: ${res.status}`
      let document = new HtmlDocument(res.body)
      return {
        comics: this.parseList(res.body),
        maxPage: this.parseMaxPage(document, page),
      }
    },
    enableTagsSuggestions: false,
  }

  /// 画廊详情
  comic = {
    loadInfo: async (id) => {
      let res = await Network.get(`${this.baseUrl}/gallery/${id}/`, this.headers)
      if (res.status !== 200) throw `Invalid status code: ${res.status}`
      let document = new HtmlDocument(res.body)

      let titleEl = document.querySelector("h1")
      let title = titleEl ? (titleEl.text || "").trim() : `Gallery ${id}`
      let subtitleEl = document.querySelector(".subtitle")
      let subtitle = subtitleEl ? (subtitleEl.text || "").trim() : ""

      let tags = this.parseTags(document)
      let description = subtitle

      // 封面：优先 og:image
      let cover = ""
      let ogImage = document.querySelector('meta[property="og:image"]')
      if (ogImage) cover = ogImage.attributes["content"] || ""
      if (!cover) {
        let firstImage = document.querySelector("img[data-src]")
        if (firstImage) cover = firstImage.attributes["data-src"] || ""
      }

      return new ComicDetails({
        title: title,
        subtitle: subtitle,
        cover: this.absoluteUrl(cover),
        description: description,
        tags: tags,
        chapters: { gallery: "全本" },
        url: `${this.baseUrl}/gallery/${id}/`,
      })
    },

    loadEp: async (comicId, epId) => {
      let res = await Network.get(`${this.baseUrl}/gallery/${comicId}/`, this.headers)
      if (res.status !== 200) throw `Invalid status code: ${res.status}`
      let document = new HtmlDocument(res.body)
      let images = this.parseImages(res.body, document)
      if (images.length === 0) throw "没有找到图片，可能是站点改版或需要登录"
      return { images: images }
    },

    onImageLoad: (url) => {
      // 这几家站点有防盗链，带上 Referer
      return {
        headers: {
          "Referer": this.baseUrl + "/",
        },
      }
    },

    onThumbnailLoad: (url) => {
      return {
        headers: {
          "Referer": this.baseUrl + "/",
        },
      }
    },

    link: {
      domains: ["hentaifox.com", "imhentai.xxx", "hentaiera.com", "hentairox.com", "hentaienvy.com", "hentaizap.com"],
      linkToId: (url) => {
        let match = url.match(/\/gallery\/(\d+)/)
        return match ? match[1] : null
      },
    },

    enableTagsTranslate: false,
  }
}
