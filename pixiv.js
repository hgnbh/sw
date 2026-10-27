/**
 * Pixiv 同人图源
 *
 * Pixiv 是最大的同人图/同人漫画平台。本源走网页版 ajax 接口：
 *   - 搜索：/ajax/search/artworks/{keyword}
 *   - 榜单：/ajax/ranking/illust、/ajax/ranking/manga
 *   - 作品详情：/ajax/illust/{id}
 *
 * 搜索和 R-18 内容需要登录。登录方式：浏览器登录 pixiv 后，从 Cookie 里复制
 * PHPSESSID 的值，填到本源的「PHPSESSID」设置项里（不需要账号密码）。
 * 不填也能看榜单（部分内容可能受限）。
 *
 * 一部作品 = 一部漫画，图片按 pageCount 逐页生成（_p0、_p1 …）。
 * 图片域名 i.pximg.net 有防盗链，读取时已自动带上 Referer。
 *
 * @type {import('./_venera_.js')}
 */
class PixivSource extends ComicSource {
  name = "Pixiv 同人图"

  key = "pixiv"

  version = "1.0.1"

  minAppVersion = "1.4.0"

  url = "https://cdn.jsdelivr.net/gh/HGNBH/my-venera-sources@main/pixiv.js"

  settings = {
    cookie: {
      title: "PHPSESSID（登录 Pixiv 后从浏览器 Cookie 复制，可留空）",
      type: "input",
      default: "",
    },
  }

  get baseUrl() {
    return "https://www.pixiv.net"
  }

  get headers() {
    return {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
      "Accept": "application/json",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      "Referer": "https://www.pixiv.net/",
    }
  }

  /// 把设置里的 PHPSESSID 写入 Cookie
  ensureCookie() {
    let cookie = this.loadSetting("cookie")
    if (cookie && String(cookie).trim().length > 0) {
      Network.setCookies("https://www.pixiv.net", [
        new Cookie({ name: "PHPSESSID", value: String(cookie).trim(), domain: ".pixiv.net" }),
      ])
    }
  }

  init() {
    this.ensureCookie()
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

  async getJson(url) {
    this.ensureCookie()
    let res = await Network.get(url, this.headers)
    if (res.status !== 200) throw `请求失败：HTTP ${res.status}`
    let data = JSON.parse(res.body)
    if (data.error) {
      let message = data.message || "未知错误"
      if (String(message).indexOf("login") >= 0 || String(message).indexOf("403") >= 0) {
        throw `Pixiv 需要登录：请在源设置里填写 PHPSESSID（${message}）`
      }
      throw `Pixiv 返回错误：${message}`
    }
    return data.body
  }

  /// 搜索 / 榜单共用的列表项解析
  parseComic(item) {
    if (!item || !item.id) return null
    if (item.illustType === 2) return null // ugoira 动图不支持

    let tags = []
    if (item.tags) tags = item.tags
    else if (item.tagList) tags = item.tagList

    return new Comic({
      id: String(item.id),
      title: item.title || `作品 ${item.id}`,
      subtitle: item.userName || "",
      cover: item.url || item.urls?.regular || item.urls?.small || "",
      tags: tags,
      description: item.description || "",
    })
  }

  /// 解析搜索响应
  parseSearch(body, page) {
    let illustManga = body.illustManga || body
    let list = illustManga.data || []
    let comics = list.map((item) => this.parseComic(item)).filter((c) => c)
    let total = illustManga.total || list.length
    let maxPage = Math.max(1, Math.ceil(total / 60))
    if (page > maxPage) maxPage = page
    return { comics: comics, maxPage: maxPage }
  }

  /// 解析榜单响应
  parseRanking(body) {
    let list = body.illusts || body.items || []
    return list.map((item) => this.parseComic(item)).filter((c) => c)
  }

  // 发现页：排行榜
  explore = [
    {
      title: "排行榜",
      type: "multiPartPage",
      load: async () => {
        let sections = [
          { title: "插画日榜", url: "https://www.pixiv.net/ajax/ranking/illust?mode=day&p=1&lang=zh" },
          { title: "插画周榜", url: "https://www.pixiv.net/ajax/ranking/illust?mode=week&p=1&lang=zh" },
          { title: "漫画日榜", url: "https://www.pixiv.net/ajax/ranking/manga?mode=day&p=1&lang=zh" },
          { title: "漫画周榜", url: "https://www.pixiv.net/ajax/ranking/manga?mode=week&p=1&lang=zh" },
        ]
        let result = []
        for (let section of sections) {
          try {
            let body = await this.getJson(section.url)
            let comics = this.parseRanking(body)
            if (comics.length > 0) result.push({ title: section.title, comics: comics })
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
      let order = this.pickOption(options, 0, "date_d")
      let mode = this.pickOption(options, 1, "all")
      let type = this.pickOption(options, 2, "all")

      let word = encodeURIComponent(keyword)
      let url =
        `${this.baseUrl}/ajax/search/artworks/${word}?word=${word}` +
        `&order=${order}&mode=${mode}&p=${page}&s_mode=s_tag_full&type=${type}&lang=zh`

      let body = await this.getJson(url)
      return this.parseSearch(body, page)
    },
    optionList: [
      {
        type: "select",
        options: [
          "date_d-最新",
          "date-最早",
          "popular_d-热门",
          "popular_male_d-男性向热门",
          "popular_female_d-女性向热门",
        ],
        label: "排序",
        default: "date_d",
      },
      {
        type: "select",
        options: ["all-全部", "safe-全年龄", "r18-仅 R-18"],
        label: "内容",
        default: "all",
      },
      {
        type: "select",
        options: ["all-全部", "illust-插画", "manga-漫画"],
        label: "类型",
        default: "all",
      },
    ],
    enableTagsSuggestions: false,
  }

  /// 作品详情
  comic = {
    loadInfo: async (id) => {
      let body = await this.getJson(`${this.baseUrl}/ajax/illust/${id}?lang=zh`)
      if (!body || !body.illustId) throw "作品不存在或已被删除"
      if (body.illustType === 2) throw "动图（Ugoira）作品暂不支持"

      let tags = {}
      if (body.tags && body.tags.tags) {
        tags["标签"] = body.tags.tags.map((t) => t.tag).filter((t) => t)
      }

      let description = body.description || ""
      let stats = []
      if (body.viewCount) stats.push(`浏览 ${body.viewCount}`)
      if (body.bookmarkCount) stats.push(`收藏 ${body.bookmarkCount}`)
      if (body.likeCount) stats.push(`点赞 ${body.likeCount}`)
      if (stats.length > 0) {
        description = (description ? description + "\n\n" : "") + stats.join(" · ")
      }

      return new ComicDetails({
        title: body.illustTitle || body.title || `作品 ${id}`,
        subtitle: body.userName || "",
        cover: body.urls?.regular || body.urls?.small || "",
        description: description,
        tags: tags,
        chapters: { all: "全本" },
        uploader: body.userName || "",
        uploadTime: body.createDate || body.uploadDate || null,
        url: `${this.baseUrl}/artworks/${id}`,
      })
    },

    loadEp: async (comicId, epId) => {
      let body = await this.getJson(`${this.baseUrl}/ajax/illust/${comicId}?lang=zh`)
      if (body.illustType === 2) throw "动图（Ugoira）作品暂不支持"

      let original = body.urls?.original || body.urls?.regular
      if (!original) throw "无法获取原图地址"

      let pageCount = body.pageCount || 1
      let images = []
      if (pageCount <= 1) {
        images.push(original)
      } else {
        for (let i = 0; i < pageCount; i++) {
          let url = original.replace(/_p0(\.[a-zA-Z0-9]+)$/, `_p${i}$1`)
          if (url === original && i > 0) {
            url = original.replace(/_p0/, `_p${i}`)
          }
          images.push(url)
        }
      }
      return { images: images }
    },

    onImageLoad: (url) => {
      return {
        headers: {
          "Referer": "https://www.pixiv.net/",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        },
      }
    },

    onThumbnailLoad: (url) => {
      return {
        headers: {
          "Referer": "https://www.pixiv.net/",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        },
      }
    },

    enableTagsTranslate: false,
  }
}
