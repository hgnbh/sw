/**
 * 漫画manga（mh03.com）Venera 漫画源
 *
 * 站点特征：
 * - CMS: MCCMS 标准前端结构
 * - 漫画详情页: /comic_{id}.html
 * - 章节阅读页: /chapter_{comicId}_{epId}.html
 * - 图片加载: .comic-content img 直接包含 data-src / src 直链，无需解密
 * - 分类筛选: /category/tags/{tag}/finish/{finish}/order/{order}/page/{page}
 * - 搜索: /search?key={keyword} 与 /search/{keyword}/{page}
 */

class Mh03 extends ComicSource {
  name = "漫画manga";
  key = "mh03";
  version = "1.0.1";
  minAppVersion = "1.0.0";
  url = "https://cdn.jsdelivr.net/gh/Magentadots/venera-configs@main/sources/mh03.js";

  settings = {
    domain: {
      title: "网站域名",
      type: "input",
      default: "www.mh03.com",
    },
  };

  get baseUrl() {
    const domain = this.loadSetting("domain") || this.settings.domain.default;
    const cleanDomain = domain.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "");
    return `https://${cleanDomain}`;
  }

  requestHeaders = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
    "Referer": "https://www.mh03.com/",
  };

  absoluteUrl(path) {
    if (!path) return "";
    if (/^https?:\/\//i.test(path)) return path;
    return `${this.baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;
  }

  comicIdFromHref(href) {
    if (!href) return "";
    const match = href.match(/\/comic_([^/?#.]+)\.html/i) || href.match(/\/comic\/([^/?#.]+)/i);
    if (match) return match[1];
    return href.replace(/^\/+|\/+$/g, "").replace(/\.html$/i, "");
  }

  chapterIdFromHref(href) {
    if (!href) return "";
    const match = href.match(/\/chapter_([^/?#]+)\.html/i) || href.match(/\/chapter\/([^/?#]+)/i);
    if (match) return match[1];
    return href.replace(/^\/+|\/+$/g, "").replace(/\.html$/i, "");
  }

  parseMaxPage(doc, currentPage = 1) {
    let maxPage = currentPage || 1;
    const links = doc.querySelectorAll(".pagination a");
    for (const link of links) {
      const href = link.attributes["href"] || "";
      const text = link.text.trim();
      const numFromText = parseInt(text);
      if (!isNaN(numFromText) && numFromText > maxPage) {
        maxPage = numFromText;
      }
      const match = href.match(/\/page\/(\d+)/i) || href.match(/\/search\/[^/]+\/(\d+)/i);
      if (match) {
        const numFromHref = parseInt(match[1]);
        if (!isNaN(numFromHref) && numFromHref > maxPage) {
          maxPage = numFromHref;
        }
      }
    }
    return maxPage;
  }

  parseComicItem(item) {
    const coverLink = item.querySelector("a.comic-cover") || item.querySelector("a[href*='comic_']");
    const imgEl = item.querySelector("img");
    const titleEl = item.querySelector("h3 a") || item.querySelector(".comic-title a") || item.querySelector("h3") || item.querySelector(".comic-title");
    if (!coverLink || !titleEl) return null;

    const href = coverLink.attributes["href"] || titleEl.attributes["href"] || "";
    const id = this.comicIdFromHref(href);
    if (!id) return null;

    const title = titleEl.text.trim();
    const cover = this.absoluteUrl(
      imgEl?.attributes["data-src"] || imgEl?.attributes["src"] || ""
    );
    const author = item.querySelector(".comic-author")?.text?.trim() || item.querySelector("p")?.text?.trim() || "";
    const badge = item.querySelector(".update-badge")?.text?.trim() || item.querySelector(".category")?.text?.trim() || "";

    return new Comic({
      id,
      title,
      cover,
      subTitle: [badge, author].filter(Boolean).join(" · "),
      description: item.querySelector(".comic-desc")?.text?.trim() || "",
    });
  }

  explore = [
    {
      title: "首页推荐",
      type: "multiPartPage",
      load: async () => {
        const res = await Network.get(`${this.baseUrl}/`, this.requestHeaders);
        if (res.status !== 200 || !res.body) throw new Error(`加载首页失败: HTTP ${res.status}`);
        const doc = new HtmlDocument(res.body);
        const parts = [];

        // 1. 轮播推荐
        const bannerItems = doc.querySelectorAll(".banner-slider .banner-item");
        if (bannerItems && bannerItems.length > 0) {
          const bannerComics = [];
          for (const item of bannerItems) {
            const link = item.querySelector("a.btn-read") || item.querySelector("a[href*='comic_']");
            const img = item.querySelector("img");
            const titleEl = item.querySelector("h3");
            if (link && titleEl) {
              const id = this.comicIdFromHref(link.attributes["href"] || "");
              if (id) {
                bannerComics.push(
                  new Comic({
                    id,
                    title: titleEl.text.trim(),
                    cover: this.absoluteUrl(img?.attributes["src"] || img?.attributes["data-src"] || ""),
                    description: item.querySelector("p")?.text?.trim() || "",
                  })
                );
              }
            }
          }
          if (bannerComics.length > 0) {
            parts.push({
              title: "轮播精选",
              comics: bannerComics,
            });
          }
        }

        // 2. 主体漫画区块（热门漫画、最新更新等）
        const sections = doc.querySelectorAll(".content-body .comic-section");
        for (const section of sections) {
          const title = section.querySelector(".section-header h2")?.text?.trim();
          if (!title) continue;
          const comics = [];
          const items = section.querySelectorAll(".comic-list .comic-item");
          for (const item of items) {
            const comic = this.parseComicItem(item);
            if (comic) comics.push(comic);
          }
          if (comics.length > 0) {
            parts.push({
              title,
              comics,
            });
          }
        }

        // 3. 排行榜
        const rankItems = doc.querySelectorAll(".rank-section .rank-list .rank-item");
        if (rankItems && rankItems.length > 0) {
          const rankComics = [];
          for (const item of rankItems) {
            const link = item.querySelector("a.rank-title") || item.querySelector("a[href*='comic_']");
            const rankNum = item.querySelector(".rank-num")?.text?.trim() || "";
            const updateInfo = item.querySelector(".rank-update")?.text?.trim() || "";
            if (link) {
              const id = this.comicIdFromHref(link.attributes["href"] || "");
              if (id) {
                rankComics.push(
                  new Comic({
                    id,
                    title: link.text.trim(),
                    cover: "",
                    subTitle: [`No.${rankNum}`, updateInfo].filter(Boolean).join(" · "),
                  })
                );
              }
            }
          }
          if (rankComics.length > 0) {
            parts.push({
              title: "漫画排行榜",
              comics: rankComics,
            });
          }
        }

        doc.dispose();
        return parts;
      },
    },
    {
      title: "热门推荐",
      type: "multiPageComicList",
      load: async (page = 1) => {
        const url = page <= 1 ? `${this.baseUrl}/custom/recom` : `${this.baseUrl}/custom/recom/page/${page}`;
        return await this.loadComicListPage(url, page);
      },
    },
    {
      title: "最新更新",
      type: "multiPageComicList",
      load: async (page = 1) => {
        const url = page <= 1 ? `${this.baseUrl}/custom/new` : `${this.baseUrl}/custom/new/page/${page}`;
        return await this.loadComicListPage(url, page);
      },
    },
    {
      title: "完结漫画",
      type: "multiPageComicList",
      load: async (page = 1) => {
        const url = page <= 1 ? `${this.baseUrl}/custom/end` : `${this.baseUrl}/custom/end/page/${page}`;
        return await this.loadComicListPage(url, page);
      },
    },
    {
      title: "排行榜",
      type: "multiPageComicList",
      load: async (page = 1) => {
        const url = page <= 1 ? `${this.baseUrl}/custom/top` : `${this.baseUrl}/custom/top/page/${page}`;
        return await this.loadComicListPage(url, page);
      },
    },
  ];

  async loadComicListPage(url, page = 1) {
    const res = await Network.get(url, this.requestHeaders);
    if (res.status !== 200 || !res.body) return { comics: [], maxPage: page };
    const doc = new HtmlDocument(res.body);
    const comics = [];

    // 解析常规 .comic-item
    const items = doc.querySelectorAll(".comic-list .comic-item, .list-genduo .comic-item, .rank-top .rank-top-item");
    for (const item of items) {
      const comic = this.parseComicItem(item);
      if (comic && !comics.some((c) => c.id === comic.id)) {
        comics.push(comic);
      }
    }

    const maxPage = this.parseMaxPage(doc, page);
    doc.dispose();
    return { comics, maxPage };
  }

  category = {
    title: "分类检索",
    parts: [
      {
        name: "题材",
        type: "fixed",
        categories: [
          "全部",
          "热血",
          "冒险",
          "科幻",
          "霸总",
          "玄幻",
          "校园",
          "修真",
          "搞笑",
          "穿越",
          "后宫",
          "耽美",
          "恋爱",
          "悬疑",
          "恐怖",
          "动作",
          "竞技",
          "古风",
          "都市",
          "纯爱",
          "剧情",
          "少年",
          "奇幻",
          "治愈",
          "短篇",
          "格斗",
          "韩漫",
          "武侠",
          "大女主",
          "总裁",
          "言情",
          "重生",
          "少女",
          "历史",
          "日漫",
          "仙侠",
          "双男主",
          "百合",
        ],
        categoryParams: [
          "",
          "6",
          "7",
          "8",
          "9",
          "10",
          "11",
          "12",
          "13",
          "14",
          "15",
          "16",
          "17",
          "18",
          "19",
          "21",
          "23",
          "28",
          "31",
          "54",
          "55",
          "57",
          "60",
          "62",
          "67",
          "69",
          "74",
          "79",
          "80",
          "83",
          "90",
          "94",
          "96",
          "104",
          "105",
          "192",
          "286",
          "27",
        ],
        itemType: "category",
      },
      {
        name: "状态",
        type: "fixed",
        categories: ["全部", "连载中", "已完结"],
        categoryParams: ["", "1", "2"],
        itemType: "category",
      },
      {
        name: "排序",
        type: "fixed",
        categories: ["热门人气", "最新更新"],
        categoryParams: ["hits", "addtime"],
        itemType: "category",
      },
    ],
    enableRankingPage: false,
  };

  categoryComics = {
    load: async (category, param, options, page = 1) => {
      let tag = "";
      let finish = "";
      let order = "";

      // options 数组对应 parts 顺序: [题材, 状态, 排序]
      if (Array.isArray(options)) {
        tag = options[0] || "";
        finish = options[1] || "";
        order = options[2] || "";
      } else if (param) {
        tag = param;
      }

      let path = "/category";
      if (tag) path += `/tags/${encodeURIComponent(tag)}`;
      if (finish) path += `/finish/${encodeURIComponent(finish)}`;
      if (order) path += `/order/${encodeURIComponent(order)}`;
      if (page > 1) path += `/page/${page}`;

      const url = `${this.baseUrl}${path}`;
      return await this.loadComicListPage(url, page);
    },
  };

  search = {
    load: async (keyword, options, page = 1) => {
      if (!keyword || !keyword.trim()) return { comics: [], maxPage: 1 };
      const safeKey = encodeURIComponent(keyword.trim());
      const url = page <= 1 ? `${this.baseUrl}/search?key=${safeKey}` : `${this.baseUrl}/search/${safeKey}/${page}`;
      return await this.loadComicListPage(url, page);
    },
  };

  comic = {
    loadInfo: async (id) => {
      const cleanId = String(id).replace(/^\/+|\/+$/g, "").replace(/\.html$/i, "").replace(/^comic_/, "");
      const url = `${this.baseUrl}/comic_${cleanId}.html`;
      const res = await Network.get(url, this.requestHeaders);
      if (res.status !== 200 || !res.body) throw new Error(`加载漫画详情失败: HTTP ${res.status}`);

      const doc = new HtmlDocument(res.body);

      // 标题
      let title = doc.querySelector(".comic-meta-info h1")?.text?.trim() || doc.querySelector("h1")?.text?.trim() || "";
      title = title.replace(/^[《<]/, "").replace(/[》>]$/, "").trim();

      // 封面
      const coverEl = doc.querySelector(".comic-cover-large img") || doc.querySelector(".comic-cover img");
      const cover = this.absoluteUrl(coverEl?.attributes["src"] || coverEl?.attributes["data-src"] || "");

      // 简介
      const description = doc.querySelector(".comic-description p")?.text?.trim() || "";

      // 作者与状态
      let author = "";
      const stats = doc.querySelectorAll(".comic-stats .stat-item");
      for (const stat of stats) {
        const text = stat.text.trim();
        if (text.includes("作者：") || text.includes("作者:")) {
          author = text.replace(/^.*作者[：:]\s*/, "").trim();
        }
      }

      // 标签与分类
      const tagList = [];
      const tagEls = doc.querySelectorAll(".comic-tags .tag");
      for (const el of tagEls) {
        const t = el.text.trim();
        if (t) {
          // 有些 tag 包含空格分隔的多个词
          const words = t.split(/\s+/).filter(Boolean);
          tagList.push(...words);
        }
      }

      // 章节列表
      const chapters = new Map();
      const chapterLinks = doc.querySelectorAll("#chapter-list .chapter-item a");
      for (const link of chapterLinks) {
        const href = link.attributes["href"] || "";
        const chapterTitle = link.text.trim();
        const epId = this.chapterIdFromHref(href);
        if (epId && chapterTitle) {
          chapters.set(epId, chapterTitle);
        }
      }

      doc.dispose();

      const tagsMap = {};
      if (tagList.length > 0) {
        tagsMap["题材"] = Array.from(new Set(tagList));
      }
      if (author) {
        tagsMap["作者"] = [author];
      }

      return new ComicDetails({
        title,
        cover,
        description,
        tags: tagsMap,
        chapters,
        updateTime: "",
        uploader: author,
        url,
      });
    },

    loadEp: async (comicId, epId) => {
      let cleanEpId = String(epId).trim().replace(/^\/+|\/+$/g, "");
      if (!cleanEpId.endsWith(".html")) cleanEpId += ".html";
      if (!cleanEpId.startsWith("chapter_") && !cleanEpId.includes("/")) {
        cleanEpId = `chapter_${cleanEpId}`;
      }

      const url = `${this.baseUrl}/${cleanEpId}`;
      const res = await Network.get(url, this.requestHeaders);
      if (res.status !== 200 || !res.body) throw new Error(`加载章节失败: HTTP ${res.status}`);

      const doc = new HtmlDocument(res.body);
      const images = [];
      const imgEls = doc.querySelectorAll(".comic-content img");

      for (const img of imgEls) {
        const src = img.attributes["data-src"] || img.attributes["src"];
        if (src && !src.includes("push.js") && !src.includes("hm.js")) {
          images.push(this.absoluteUrl(src.trim()));
        }
      }

      doc.dispose();

      if (images.length === 0) {
        throw new Error("未解析到章节图片");
      }

      return {
        images,
      };
    },

    onImageLoad: (url, comicId, epId) => {
      let referer = `${this.baseUrl}/`;
      if (comicId && epId) {
        let cleanEpId = String(epId).trim().replace(/^\/+|\/+$/g, "");
        if (!cleanEpId.endsWith(".html")) cleanEpId += ".html";
        if (!cleanEpId.startsWith("chapter_") && !cleanEpId.includes("/")) {
          cleanEpId = `chapter_${cleanEpId}`;
        }
        referer = `${this.baseUrl}/${cleanEpId}`;
      }
      return {
        headers: {
          "User-Agent": this.requestHeaders["User-Agent"],
          "Referer": referer,
          "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        },
      };
    },

    onThumbnailLoad: (url) => ({
      headers: {
        "User-Agent": this.requestHeaders["User-Agent"],
        "Referer": `${this.baseUrl}/`,
        "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      },
    }),
  };

  onThumbnailLoad = (url) => ({
    headers: {
      "User-Agent": this.requestHeaders["User-Agent"],
      "Referer": `${this.baseUrl}/`,
      "Accept": "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
    },
  });
}

