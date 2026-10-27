/**
 * AO3（Archive of Our Own）同人图文源
 *
 * AO3 是同人创作归档站，同人漫画/同人图通常以「一章多图」的形式发布在作品里。
 * 本源把每个 work 当作一部漫画：work = 漫画，chapter = 章节，正文里的 <img> = 漫画页。
 * 注意：纯文字作品没有图片，阅读时会显示空白，这是 AO3 本身的内容形态决定的。
 *
 * 站点在部分地区需要代理才能访问，可在源设置里切换镜像/同架构站点。
 *
 * @type {import('./_venera_.js')}
 */
class AO3Source extends ComicSource {
  name = "AO3 同人图文"

  key = "ao3"

  version = "1.0.1"

  minAppVersion = "1.4.0"

  url = "https://cdn.jsdelivr.net/gh/HGNBH/my-venera-sources@main/ao3.js"

  settings = {
    domain: {
      title: "站点",
      type: "select",
      options: [
        { value: "https://archiveofourown.org", text: "archiveofourown.org（官方）" },
        { value: "https://squidge.world", text: "squidge.world（AO3 同架构）" },
      ],
      default: "https://archiveofourown.org",
    },
  }

  get baseUrl() {
    let domain = this.loadSetting("domain") || "https://archiveofourown.org"
    return domain.replace(/\/+$/, "")
  }

  get headers() {
    return {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    }
  }

  /// 把相对地址补全为绝对地址
  absoluteUrl(url) {
    if (!url) return ""
    if (url.startsWith("//")) return "https:" + url
    if (url.startsWith("/")) return this.baseUrl + url
    return url
  }

  /// 读取搜索选项，并去掉某些客户端自动加上的引号
  pickOption(options, index, fallback) {
    let value = options && options[index] != null ? options[index] : fallback
    value = String(value).trim()
    if (value.length >= 2) {
      let first = value.charAt(0)
      let last = value.charAt(value.length - 1)
      if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
        value = value.slice(1, -1)
      }
    }
    return value || fallback
  }

  /// 从作品链接里取出 work id
  workIdFromHref(href) {
    if (!href) return null
    let match = href.match(/\/works\/(\d+)/)
    return match ? match[1] : null
  }

  /// 解析搜索结果 / 列表里的一条作品
  parseComic(item) {
    let link = item.querySelector("h4.heading a") || item.querySelector("h4 a")
    if (!link) return null
    let id = this.workIdFromHref(link.attributes["href"])
    if (!id) return null

    let title = (link.text || "").trim()
    if (!title) title = `Work ${id}`

    let authorEl = item.querySelector('a[rel="author"]')
    let author = authorEl ? (authorEl.text || "").trim() : ""

    // 标签：fandom + 关系/角色/自由标签 + 分级/警告/分类
    let tags = []
    let seen = {}
    for (let tag of item.querySelectorAll("a.tag")) {
      let text = (tag.text || "").trim()
      if (!text || seen[text]) continue
      seen[text] = true
      tags.push(text)
      if (tags.length >= 24) break
    }

    // 简介
    let summaryEl =
      item.querySelector("blockquote.userstuff") ||
      item.querySelector("blockquote.summary") ||
      item.querySelector(".summary")
    let description = summaryEl ? (summaryEl.text || "").trim() : ""

    let comic = new Comic({
      id: id,
      title: title,
      subtitle: author,
      cover: "",
      tags: tags,
      description: description,
    })

    // 统计信息放进 description 尾部，列表页也能看到热度
    let stats = this.parseStats(item)
    let extra = []
    if (stats.kudos) extra.push(`Kudos ${stats.kudos}`)
    if (stats.hits) extra.push(`Hits ${stats.hits}`)
    if (stats.chapters) extra.push(`章节 ${stats.chapters}`)
    if (extra.length > 0) {
      comic.description = (description ? description + "\n\n" : "") + extra.join(" · ")
    }
    return comic
  }

  /// 解析 <dl class="stats"> 里的 dt/dd 对
  parseStats(root) {
    let result = {}
    let statsList = root.querySelectorAll("dl.stats")
    for (let stats of statsList) {
      let names = stats.querySelectorAll("dt")
      let values = stats.querySelectorAll("dd")
      for (let i = 0; i < names.length && i < values.length; i++) {
        let key = (names[i].text || "").replace(":", "").trim().toLowerCase()
        let value = (values[i].text || "").trim()
        result[key] = value
      }
    }
    return {
      kudos: result["kudos"] || "",
      hits: result["hits"] || "",
      chapters: result["chapters"] || "",
      words: result["words"] || "",
      language: result["language"] || "",
    }
  }

  /// 解析列表页页数
  parseMaxPage(document, page) {
    let links = document.querySelectorAll("ol.pagination a")
    let maxPage = page
    for (let link of links) {
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

  /// 通用列表解析
  parseList(html, page) {
    let document = new HtmlDocument(html)
    let comics = []
    for (let item of document.querySelectorAll("li.work.blurb, li.blurb")) {
      let comic = this.parseComic(item)
      if (comic) comics.push(comic)
    }
    // 兜底：结构变化时直接扫描作品链接
    if (comics.length === 0) {
      let seen = {}
      for (let link of document.querySelectorAll('a[href*="/works/"]')) {
        let id = this.workIdFromHref(link.attributes["href"])
        if (!id || seen[id]) continue
        seen[id] = true
        let title = (link.text || "").trim()
        if (!title || title.length < 2) continue
        comics.push(new Comic({ id: id, title: title, cover: "", tags: [], description: "" }))
        if (comics.length >= 30) break
      }
    }
    return { comics: comics, maxPage: this.parseMaxPage(document, page) }
  }

  // 发现页
  explore = [
    {
      title: "同人图",
      type: "multiPartPage",
      load: async () => {
        let sections = [
          { title: "热门同人图（Fanart）", tag: "Fanart", sort: "kudos_count" },
          { title: "热门漫画（Comic）", tag: "Comic", sort: "kudos_count" },
          { title: "同人志（Doujinshi）", tag: "Doujinshi", sort: "kudos_count" },
        ]
        let result = []
        for (let section of sections) {
          try {
            let res = await Network.get(
              `${this.baseUrl}/tags/${encodeURIComponent(section.tag)}/works?work_search%5Bsort_column%5D=${section.sort}&work_search%5Bsort_direction%5D=desc`,
              this.headers
            )
            if (res.status !== 200) continue
            let data = this.parseList(res.body, 1)
            if (data.comics.length === 0) continue
            result.push({
              title: section.title,
              comics: data.comics,
            })
          } catch (e) {
            console.error(e)
          }
        }
        return result
      },
    },
  ]

  /// 搜索
  search = {
    load: async (keyword, options, page) => {
      let sort = this.pickOption(options, 0, "best_match")
      let complete = this.pickOption(options, 1, "all") === "complete"
      let url =
        `${this.baseUrl}/works/search?work_search%5Bquery%5D=${encodeURIComponent(keyword)}` +
        `&work_search%5Bsort_column%5D=${sort}&work_search%5Bsort_direction%5D=desc&page=${page}`
      if (complete) url += "&work_search%5Bcomplete%5D=T"

      let res = await Network.get(url, this.headers)
      if (res.status !== 200) throw `Invalid status code: ${res.status}`
      return this.parseList(res.body, page)
    },
    optionList: [
      {
        type: "select",
        options: [
          "best_match-最佳匹配",
          "kudos_count-按 Kudos",
          "hits-按浏览量",
          "revised_at-最近更新",
          "created_at-发布时间",
          "word_count-按字数",
        ],
        label: "排序",
        default: "best_match",
      },
      {
        type: "select",
        options: ["all-全部", "complete-仅完结"],
        label: "状态",
        default: "all",
      },
    ],
    enableTagsSuggestions: false,
  }

  /// 作品详情
  comic = {
    loadInfo: async (id) => {
      let res = await Network.get(`${this.baseUrl}/works/${id}?view_adult=true`, this.headers)
      if (res.status !== 200) throw `Invalid status code: ${res.status}`
      if (/This work is only available to logged-in users/i.test(res.body)) {
        throw "该作品仅登录用户可见，请先在 AO3 登录"
      }

      let document = new HtmlDocument(res.body)

      let titleEl = document.querySelector("h2.title.heading") || document.querySelector("h2.title")
      let title = titleEl ? (titleEl.text || "").trim() : `Work ${id}`

      let authorEl = document.querySelector("h3.byline.heading a") || document.querySelector('a[rel="author"]')
      let author = authorEl ? (authorEl.text || "").trim() : ""

      let summaryEl = document.querySelector("div.summary blockquote.userstuff") || document.querySelector("div.summary")
      let description = summaryEl ? (summaryEl.text || "").trim() : ""

      // 标签分组
      let tagGroups = [
        ["分级", "rating"],
        ["警告", "warning"],
        ["分类", "category"],
        ["同人圈", "fandom"],
        ["关系", "relationship"],
        ["角色", "character"],
        ["其他标签", "freeform"],
      ]
      let tags = {}
      for (let group of tagGroups) {
        let dd = document.querySelector(`dd.${group[1]}.tags`)
        if (!dd) continue
        let values = []
        for (let a of dd.querySelectorAll("a.tag")) {
          let text = (a.text || "").trim()
          if (text) values.push(text)
        }
        if (values.length > 0) tags[group[0]] = values
      }

      // 统计
      let stats = this.parseStats(document)
      let statsText = []
      if (stats.words) statsText.push(`字数 ${stats.words}`)
      if (stats.chapters) statsText.push(`章节 ${stats.chapters}`)
      if (stats.kudos) statsText.push(`Kudos ${stats.kudos}`)
      if (stats.hits) statsText.push(`Hits ${stats.hits}`)
      if (stats.language) statsText.push(`语言 ${stats.language}`)
      if (statsText.length > 0) {
        description = (description ? description + "\n\n" : "") + statsText.join(" · ")
      }

      // 章节：多章作品有 select#selected_id，单章作品没有
      let chapters = {}
      for (let option of document.querySelectorAll("#selected_id option")) {
        let value = option.attributes["value"]
        if (!value) continue
        chapters[value] = (option.text || "").trim()
      }
      if (Object.keys(chapters).length === 0) {
        chapters["work"] = "第 1 章"
      }

      return new ComicDetails({
        title: title,
        subtitle: author,
        cover: "",
        description: description,
        tags: tags,
        chapters: chapters,
        uploader: author,
        url: `${this.baseUrl}/works/${id}`,
      })
    },

    loadEp: async (comicId, epId) => {
      let url
      if (!epId || epId === "work") {
        url = `${this.baseUrl}/works/${comicId}?view_full_work=true&view_adult=true`
      } else {
        url = `${this.baseUrl}/works/${comicId}/chapters/${epId}?view_adult=true`
      }

      let res = await Network.get(url, this.headers)
      if (res.status !== 200) throw `Invalid status code: ${res.status}`

      let document = new HtmlDocument(res.body)
      let root =
        document.querySelector("#chapters") ||
        document.querySelector("#workskin") ||
        document.querySelector("div.userstuff")

      let images = []
      let seen = {}
      if (root) {
        for (let img of root.querySelectorAll("img")) {
          let src = img.attributes["data-src"] || img.attributes["src"] || ""
          if (!src) continue
          // 过滤站点自身的皮肤、表情、头像等装饰图
          if (/\/images\/(skins|emoji|avatars|logos|icons)\//.test(src)) continue
          if (/transparent\.gif|blank\.gif/.test(src)) continue
          let abs = this.absoluteUrl(src)
          if (!/^https?:\/\//.test(abs)) continue
          if (seen[abs]) continue
          seen[abs] = true
          images.push(abs)
        }
      }

      if (images.length === 0) {
        throw "这部作品没有图片（可能是纯文字作品），无法以漫画方式阅读"
      }
      return { images: images }
    },

    onImageLoad: (url) => {
      // AO3 的图片放在站外图床，带上来源页更稳妥
      return {
        headers: {
          "Referer": `${this.baseUrl}/`,
        },
      }
    },

    link: {
      domains: ["archiveofourown.org", "squidge.world"],
      linkToId: (url) => {
        let match = url.match(/\/works\/(\d+)/)
        return match ? match[1] : null
      },
    },

    enableTagsTranslate: false,
  }
}
