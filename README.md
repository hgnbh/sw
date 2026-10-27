# my-venera-sources

个人维护的 [Venera](https://github.com/venera-app/venera) 漫画源索引仓库。

在 Venera 中「添加源仓库」，填入下面的地址即可加载全部源：

```
https://cdn.jsdelivr.net/gh/HGNBH/my-venera-sources@main/index.json
```

（国内访问 jsDelivr 不稳定时，可改用
`https://raw.githubusercontent.com/HGNBH/my-venera-sources/main/index.json`，或手动导入单个 `.js` 文件。）

## 目录结构

| 文件 | 说明 |
| --- | --- |
| `index.json` | 源列表，每项包含 `name` / `fileName` / `key` / `version` |
| `*.js` | 各站点漫画源，统一继承 `ComicSource` |
| `ao3.js` | AO3 同人图文源 |
| `hentaifox.js` | HentaiFox / IMHentai 系列同人画廊源 |
| `lofter.js` | LOFTER（乐乎）同人图文源 |
| `pixiv.js` | Pixiv 同人图源 |

## 同人源说明

Venera 的阅读器以「图片」为最小单位，所以同人站点按下面的方式接入：

- **AO3**：一个 work = 一部漫画，一章 = 一个章节，正文中的 `<img>` = 漫画页。
  纯文字作品没有图片，阅读时会提示无法以漫画方式阅读，属于正常现象。
  发现页提供 Fanart / Comic / Doujinshi 三个热门标签入口，搜索支持排序与「仅完结」。
- **HentaiFox 系列**：`hentaifox.com`、`imhentai.xxx`、`hentaiera.com`、`hentairox.com`、
  `hentaienvy.com`、`hentaizap.com` 共用同一套程序，源设置里可切换站点；一个画廊 = 一部漫画。
- **LOFTER**：一篇博文 = 一部漫画。使用 LOFTER 安卓客户端的公开接口，**无需登录**。
  注意 LOFTER 官方只提供标签检索，所以搜索框里填标签名（例如「原神同人」「咒术回战」）。
- **Pixiv**：一部作品 = 一部漫画，多图作品按 `_p0.._pN` 逐页读取。
  搜索、R-18 内容需要登录：在浏览器登录 Pixiv 后，把 Cookie 里的 `PHPSESSID` 值填到源设置的
  「PHPSESSID」项即可（不需要账号密码）。不登录也可以看发现页的排行榜。

> AO3、Pixiv、HentaiFox 系列在部分网络环境下需要代理才能访问，能否打开取决于所用网络，与源本身无关。

## 线路与可用性（2026-10 实测）

| 状态 | 源 |
| --- | --- |
| 可直接使用 | 动漫屋、漫画人、51漫画、再漫画、GoDa、CCC、古风、瓜子、香蕉、4399、图库、W漫画、漫网、漫蛙吧、如漫画、SF漫画、腾讯动漫、咚漫、WEBTOON、飞翔、嬉皮、优酷、zero、MOJOIN、Rawkuma、爱看漫、漫小肆、动漫啦（已修复改版）、漫客栈、布卡漫画、看漫画、思思漫画、漫画Manga、次元漫画 |
| 需要代理 | AO3、Pixiv、HentaiFox 系列、e-hentai、nhentai、hitomi、禁漫天堂、紳士漫畫、MangaDex、comick、漫画柜、18漫画、热辣漫画、jcomic.net |
| 需要登录 / 人机验证 | MYCOMIC（Cloudflare 验证）、NoyManga（网页登录）、Picacg（账号登录） |
| 已移除（站点失效） | 漫画1234（`amh1234.com` 域名已停放）、爱看漫 v2（详情页 404） |

> 漫小肆的 `mxshm.top`、`ikanwzd.cc` 线路已失效，源内已默认切到 `jjmh.top` 并做自动回退。
> 动漫啦已按新结构重写（`a.comic-card`、`/manhua/so/{关键词}/`、`/all.html` 整话阅读）。

## 添加新源

1. 新建 `xxx.js`，定义 `class Xxx extends ComicSource`，至少实现
   `name` / `key` / `version` / `minAppVersion` / `url` 与 `explore`、`search`、`comic.loadInfo`、`comic.loadEp`；
2. 在 `index.json` 中追加 `{ "name", "fileName", "key", "version" }`，`version` 必须与文件内一致；
3. 修改已有源时递增 `version`，否则客户端不会提示更新。

## 说明

- 本仓库只提供阅读入口与解析脚本，所有漫画、图片、文字的版权归原站点与原作者所有。
- 源依赖第三方站点页面结构或接口，站点改版后可能失效，欢迎提 Issue 或 PR。
