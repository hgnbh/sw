/**
 * LOFTER（乐乎）同人图文源
 *
 * LOFTER 是中文同人创作的主要平台之一，同人漫画/同人图一般以「图片博文」的形式发布。
 * 本源使用 LOFTER 安卓客户端的公开接口（无需登录）：
 *   - 标签博文列表：https://api.lofter.com/newapi/tagPosts.json
 *   - 博文详情：    https://api.lofter.com/oldapi/post/detail.api
 *
 * 一篇博文 = 一部漫画，博文里的图片 = 漫画页。
 * 注意：LOFTER 官方只提供「标签」检索，所以这里的搜索框填的是标签名（如：原神同人）。
 *
 * @type {import('./_venera_.js')}
 */
class LofterSource extends ComicSource {
  name = "LOFTER 同人图文"

  key = "lofter"

  version = "1.0.1"

  minAppVersion = "1.4.0"

  url = "https://cdn.jsdelivr.net/gh/HGNBH/my-venera-sources@main/lofter.js"

  get headers() {
    return {
      "User-Agent": "LOFTER-Android 8.2.36 (V2309A; Android 9; null) WIFI",
      "Content-Type": "application/x-www-form-urlencoded; charset=utf-8",
      "Accept": "*/*",
      "Accept-Language": "zh-CN,zh;q=0.9",
    }
  }

  /// 表单编码
  encodeForm(data) {
    let parts = []
    for (let key in data) {
      parts.push(`${encodeURIComponent(key)}=${encodeURIComponent(data[key])}`)
    }
    return parts.join("&")
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

  /// 旧图床地址（nos.netease.com）转换为 CDN 地址
  fixImage(url) {
    if (!url) return ""
    if (url.indexOf("nos.netease.com") >= 0) {
      let match = url.match(/nos\.netease\.com\/(imglf\d+)\/img\/(.+)$/)
      if (match) return `https://${match[1]}.lf127.net/img/${match[2]}`
    }
    if (url.startsWith("//")) return "https:" + url
    return url
  }

  /// 去掉摘要里的 HTML 标签
  stripHtml(html) {
    if (!html) return ""
    return html
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  }

  /// 标签博文列表
  async loadTagPosts(tag, offset, postTypes, type) {
    let body = this.encodeForm({
      product: "lofter-android-8.2.36",
      postTypes: postTypes || "",
      offset: String(offset),
      postYm: "",
      recentDay: "0",
      protectedFlag: "0",
      range: "0",
      firstpermalink: "null",
      style: "0",
      tag: tag,
      type: type || "total",
      returnGiftCombination: "",
    })
    let res = await Network.post("https://api.lofter.com/newapi/tagPosts.json", this.headers, body)
    if (res.status !== 200) throw `请求失败：HTTP ${res.status}`
    let data = JSON.parse(res.body)
    if (data.msg !== "成功") throw `LOFTER 返回错误：${data.msg}`
    return data.data
  }

  /// 博文详情
  async loadPostDetail(comicId) {
    let parts = String(comicId).split("_")
    if (parts.length < 2) throw "无效的博文 ID"
    let blogId = parts[0]
    let postId = parts[1]

    let body = this.encodeForm({
      targetblogid: blogId,
      supportposttypes: "1,2,3,4,5,6",
      tagFrom: "",
      offset: "0",
      requestType: "0",
      postdigestnew: "1",
      postid: postId,
      checkpwd: "1",
      needgetpoststat: "1",
    })
    let res = await Network.post("https://api.lofter.com/oldapi/post/detail.api", this.headers, body)
    if (res.status !== 200) throw `请求失败：HTTP ${res.status}`
    let data = JSON.parse(res.body)
    if (!data.response || !data.response.posts || data.response.posts.length === 0) {
      throw "无法获取博文内容，可能已被删除或仅粉丝可见"
    }
    return data.response.posts[0].post
  }

  /// 列表项 -> Comic
  parsePost(item) {
    let view = item.postData && item.postData.postView
    if (!view) return null
    let blog = item.blogInfo || {}

    let cover = ""
    if (view.firstImage) {
      cover = this.fixImage(view.firstImage.orign || view.firstImage.raw || "")
    }

    let description = this.stripHtml(view.digest || "")

    return new Comic({
      id: `${view.blogId}_${view.id}`,
      title: view.title || description.slice(0, 30) || `博文 ${view.id}`,
      subtitle: blog.blogNickName || blog.blogName || "",
      cover: cover,
      tags: view.tagList || [],
      description: description,
    })
  }

  // 发现页
  explore = [
    {
      title: "同人热门",
      type: "multiPartPage",
      load: async () => {
        let tags = [
          { title: "同人", tag: "同人" },
          { title: "同人图", tag: "同人图" },
          { title: "同人漫画", tag: "同人漫画" },
          { title: "手书", tag: "手书" },
        ]
        let result = []
        for (let section of tags) {
          try {
            let data = await this.loadTagPosts(section.tag, 0, "2")
            let comics = (data.list || []).map((item) => this.parsePost(item)).filter((c) => c)
            if (comics.length === 0) continue
            result.push({ title: section.title, comics: comics })
          } catch (e) {
            console.error(e)
          }
        }
        return result
      },
    },
  ]

  /// 搜索（LOFTER 只支持标签检索）
  search = {
    load: async (keyword, options, page) => {
      let postTypes = this.pickOption(options, 0, "image") === "all" ? "" : "2"
      let type = this.pickOption(options, 1, "total")

      let offset = (page - 1) * 10
      let data = await this.loadTagPosts(keyword.trim(), offset, postTypes, type)
      let comics = (data.list || []).map((item) => this.parsePost(item)).filter((c) => c)
      let maxPage = data.offset === -1 ? page : page + 1
      return { comics: comics, maxPage: maxPage }
    },
    optionList: [
      {
        type: "select",
        options: ["image-只看图片博文", "all-全部博文"],
        label: "类型",
        default: "image",
      },
      {
        type: "select",
        options: ["total-热门", "date-最新"],
        label: "排序",
        default: "total",
      },
    ],
    enableTagsSuggestions: false,
  }

  /// 博文详情
  comic = {
    loadInfo: async (id) => {
      let post = await this.loadPostDetail(id)
      if (post.needPay || post.payView) throw "这篇博文需要付费/解锁后才能查看"

      let title = post.title || `博文 ${post.id}`
      let author = (post.blogInfo && (post.blogInfo.blogNickName || post.blogInfo.blogName)) || ""

      let description = this.stripHtml(post.content || "")
      if (post.caption) description = (post.caption + "\n" + description).trim()
      if (description.length > 400) description = description.slice(0, 400) + "…"

      let cover = ""
      if (post.firstImageUrl) {
        let raw = post.firstImageUrl
        if (typeof raw === "string" && raw.trim().startsWith("[")) {
          try {
            let arr = JSON.parse(raw)
            if (arr && arr.length > 0) raw = arr[0]
          } catch (e) {
            raw = ""
          }
        }
        cover = this.fixImage(raw)
      }

      let chapters = {}
      chapters["post"] = "全本"

      let uploadTime = null
      if (post.publishTime) {
        let date = new Date(post.publishTime)
        let pad = (n) => (n < 10 ? "0" + n : "" + n)
        uploadTime = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
      }

      return new ComicDetails({
        title: title,
        subtitle: author,
        cover: cover,
        description: description,
        tags: { "标签": post.tagList || [] },
        chapters: chapters,
        uploader: author,
        uploadTime: uploadTime,
        url: post.permalink ? `https://www.lofter.com/post/${post.permalink}` : null,
      })
    },

    loadEp: async (comicId, epId) => {
      let post = await this.loadPostDetail(comicId)
      if (post.needPay || post.payView) throw "这篇博文需要付费/解锁后才能查看"

      let images = []

      // 图片博文：photoLinks 是 JSON 字符串
      if (post.photoLinks) {
        try {
          let photos = JSON.parse(post.photoLinks)
          for (let photo of photos) {
            let url = photo.raw || photo.orign || photo.orignWithTag || ""
            if (!url) continue
            let fixed = this.fixImage(url)
            if (fixed && images.indexOf(fixed) < 0) images.push(fixed)
          }
        } catch (e) {
          console.warn("解析 photoLinks 失败", e)
        }
      }

      // 文字博文：正文里内嵌的图片
      if (images.length === 0 && post.content) {
        let regex = /<img[^>]+src=["']([^"']+)["']/gi
        let match
        while ((match = regex.exec(post.content)) !== null) {
          let fixed = this.fixImage(match[1])
          if (fixed && fixed.startsWith("http") && images.indexOf(fixed) < 0) images.push(fixed)
        }
      }

      if (images.length === 0) throw "这篇博文没有图片，无法以漫画方式阅读"
      return { images: images }
    },

    onImageLoad: (url) => {
      return {
        headers: {
          "Referer": "https://www.lofter.com/",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36",
        },
      }
    },

    enableTagsTranslate: false,
  }
}
