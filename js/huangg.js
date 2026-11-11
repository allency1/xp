/**
 * xptv_huangguo.js — 黄果短剧 XPTV 源
 * 站点: https://huangguoai.com
 * 重写日期: 2026-11-11
 *
 * 站点 2026-11-09 改版说明（旧脚本播放失败的原因）：
 *   - 旧接口 GET /api/videos/{id}/play 已废弃，只返回空的 video_url
 *   - 新接口: POST /api/videos/{id}/episodes/{ep}/playback （明文 JSON，无需加密通道）
 *     返回 data.streams.main（H.264 HLS）/ data.streams.hevc / data.streams.preview
 *   - 站点另有 /api/playback/request 加密通道（ECDH+AES-GCM），但上面这个明文接口同效，脚本走明文
 *
 * 封面说明：站点图床（pic.drleao.cn）的封面是 AES-128-CBC 加密图，前端 worker 解密，播放器拿不到明文图。
 *   默认走解密代理 IMG_PROXY（HMAC 签名，沿用旧脚本的代理与密钥；代理返回明文 JPEG）。
 *   代理不可用时会自动降级为标题占位图。把 IMG_PROXY 置空即完全禁用代理。
 *
 * 接口清单（均已实测）：
 *   列表   GET  /api/videos?page=&size=24&sort=hot|new
 *   分类   GET  /api/videos/category/{route}?page=&size=24&sort=hot|new   route: ai-duanju/ai-manju/ai-huanlian/ai-mogai
 *   标签   GET  /api/videos/tag/{中文标签名}?page=&size=24                 注意是中文名，不是拼音 slug
 *   排行   GET  /api/ranks/hot                                           共20条，无翻页
 *   搜索   GET  /api/search?q=&page=
 *   详情   GET  /api/videos/{id}                                         data.episodes[] 分集
 *   取流   POST /api/videos/{id}/episodes/{ep}/playback  body {}          data.streams.main
 *   取流失败时 status=0（如集数不存在）
 */

const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'

// 封面解密代理（沿用旧脚本配置；置空则改用标题占位图）
const IMG_PROXY = 'https://huangguo.498246.xyz/img'
const IMG_PROXY_SECRET = '6482883d232408ab8658992a0bfc32574649c37e049847a9ab84dde61c6cfe35'

let appConfig = {
    ver: 20261111,
    title: '黄果短剧',
    site: 'https://huangguoai.com',
    tabs: [
        { name: '热门', ext: { mode: 'list', sort: 'hot' } },
        { name: '最新', ext: { mode: 'list', sort: 'new' } },
        { name: '排行榜', ext: { mode: 'rank' } },
        { name: 'AI成人短剧', ext: { mode: 'cat', route: 'ai-duanju' } },
        { name: 'AI成人漫剧', ext: { mode: 'cat', route: 'ai-manju' } },
        { name: 'AI换脸', ext: { mode: 'cat', route: 'ai-huanlian' } },
        { name: 'AI魔改', ext: { mode: 'cat', route: 'ai-mogai' } },
        { name: '都市', ext: { mode: 'tag', tag: '都市' } },
        { name: '现代', ext: { mode: 'tag', tag: '现代' } },
        { name: '校园', ext: { mode: 'tag', tag: '校园' } },
        { name: '熟女', ext: { mode: 'tag', tag: '熟女' } },
        { name: '豪门', ext: { mode: 'tag', tag: '豪门' } },
        { name: '后宫', ext: { mode: 'tag', tag: '后宫' } },
        { name: '古风', ext: { mode: 'tag', tag: '古风' } },
        { name: '奇幻', ext: { mode: 'tag', tag: '奇幻' } },
        { name: '职场', ext: { mode: 'tag', tag: '职场' } },
        { name: '娱乐圈', ext: { mode: 'tag', tag: '娱乐圈' } },
        { name: '甜宠', ext: { mode: 'tag', tag: '甜宠' } },
        { name: '年下', ext: { mode: 'tag', tag: '年下' } },
    ],
}

async function getConfig(ext) {
    if (ext) {
        try {
            const cfg = argsify(ext)
            if (cfg && cfg.site) appConfig.site = String(cfg.site).replace(/\/+$/, '')
        } catch (e) {}
    }
    return jsonify(appConfig)
}

function site() {
    return appConfig.site
}

function apiHeaders(json) {
    const h = {
        'User-Agent': UA,
        'Accept': 'application/json, text/plain, */*',
        'Referer': site() + '/',
    }
    if (json) {
        h['Content-Type'] = 'application/json'
        h['Origin'] = site()
    }
    return h
}

function apiGet(path) {
    return $fetch.get(site() + path, { headers: apiHeaders(false), timeout: 15000 })
}

function apiPost(path, body) {
    return $fetch.post(site() + path, JSON.stringify(body || {}), { headers: apiHeaders(true), timeout: 15000 })
}

// $fetch 返回的 data 可能是字符串或对象，统一取出 JSON
function parseBody(resp) {
    let d = resp && resp.data
    if (typeof d === 'string') {
        try { d = JSON.parse(d) } catch (e) { d = null }
    }
    return d
}

// 占位海报（代理不可用时用标题生成占位图）
function poster(title) {
    let label = String(title || '黄果短剧').trim() || '黄果短剧'
    if (label.length > 18) label = label.slice(0, 18)
    return 'https://placehold.co/480x720/111111/FFD21C/png?font=source-sans-pro&text=' + encodeURIComponent(label)
}

// 图床封面去掉签名参数（加密图无需 auth_key，去参数后地址稳定可缓存）
function cleanImgUrl(u) {
    u = String(u || '')
    if (!u) return ''
    if (u.indexOf('//') === 0) u = 'https:' + u
    if (/drleao\.cn|aluxvl\.cn|eisees\.com/.test(u)) u = u.replace(/\?.*$/, '')
    return u
}

// 走解密代理换明文 JPEG：sig = HMAC-SHA256(url + "\n" + exp, secret)
function proxyPic(rawUrl) {
    if (!IMG_PROXY || !IMG_PROXY_SECRET) return ''
    const u = cleanImgUrl(rawUrl)
    if (!u) return ''
    try {
        const cjs = (typeof CryptoJS !== 'undefined' && CryptoJS) ? CryptoJS : createCryptoJS()
        const exp = Math.floor(Date.now() / 1000) + 6 * 3600
        const sig = cjs.HmacSHA256(u + '\n' + exp, IMG_PROXY_SECRET).toString(cjs.enc.Hex)
        return IMG_PROXY + '?url=' + encodeURIComponent(u) + '&exp=' + exp + '&sig=' + sig
    } catch (e) {
        return ''
    }
}

function pickCover(rawUrl, title) {
    return proxyPic(rawUrl) || poster(title)
}

function toCard(it) {
    if (!it) return null
    const id = String(it.id != null && it.id !== '' ? it.id : (it.video_id != null ? it.video_id : ''))
    if (!id) return null
    const title = String(it.title || it.name || '')
    const parts = []
    const ep = Number(it.episode_count || it.total_episodes || 0)
    if (it.is_finished) parts.push(ep ? '全' + ep + '集' : '完结')
    else if (ep > 1) parts.push('更新至' + ep + '集')
    if (it.metric_label && it.metric_value != null) parts.push(it.metric_label + ' ' + it.metric_value)
    if (it.score) parts.push('★' + it.score)
    if (!parts.length && Array.isArray(it.tags) && it.tags.length) parts.push(it.tags.slice(0, 3).join(' '))

    return {
        vod_id: id,
        vod_name: title || id,
        vod_pic: pickCover(it.cover || it.vod_pic || it.pic || '', title || id),
        vod_remarks: parts.join(' '),
        ext: { id: id },
    }
}

async function getCards(ext) {
    ext = argsify(ext)
    const page = Number(ext.page || 1) || 1
    const mode = ext.mode || 'list'
    let items = []

    try {
        if (mode === 'rank') {
            // 榜单固定20条，无翻页
            if (page === 1) {
                const d = parseBody(await apiGet('/api/ranks/hot'))
                items = (d && d.data && d.data.items) || []
            }
        } else if (mode === 'cat') {
            const d = parseBody(await apiGet(
                '/api/videos/category/' + encodeURIComponent(ext.route || '') +
                '?page=' + page + '&size=24&sort=' + (ext.sort === 'new' ? 'new' : 'hot')
            ))
            items = (d && d.data && d.data.items) || []
        } else if (mode === 'tag') {
            const d = parseBody(await apiGet(
                '/api/videos/tag/' + encodeURIComponent(ext.tag || '') +
                '?page=' + page + '&size=24&sort=hot'
            ))
            items = (d && d.data && d.data.items) || []
        } else {
            const sort = ext.sort === 'new' ? 'new' : 'hot'
            const d = parseBody(await apiGet('/api/videos?page=' + page + '&size=24&sort=' + sort))
            items = (d && d.data && d.data.items) || []
        }
    } catch (e) {
        $print('黄果 getCards 失败: ' + e)
    }

    const cards = []
    for (let i = 0; i < items.length; i++) {
        const c = toCard(items[i])
        if (c) cards.push(c)
    }
    $print('黄果 ' + mode + ' 第' + page + '页 → ' + cards.length + ' 条')
    return jsonify({ list: cards })
}

function epName(e, index, n) {
    const raw = String((e && e.title) || '').trim().split('\n')[0]
    const base = '第' + n + '集'
    if (!raw || raw === base) return base
    // 分集标题多为长文案，过长的只显示集数
    if (raw.length > 16) return base
    if (raw.indexOf('第') === 0) return raw
    return base + ' ' + raw
}

async function getTracks(ext) {
    ext = argsify(ext)
    const id = String(ext.id != null && ext.id !== '' ? ext.id : (ext.vod_id != null ? ext.vod_id : ''))
    const tracks = []

    if (id) {
        try {
            const d = parseBody(await apiGet('/api/videos/' + encodeURIComponent(id)))
            const data = (d && d.data) || {}
            const eps = Array.isArray(data.episodes) ? data.episodes : []
            for (let i = 0; i < eps.length; i++) {
                const e = eps[i]
                const n = e.ep_num || e.episode || (i + 1)
                tracks.push({
                    name: epName(e, i, n),
                    pan: '',
                    ext: { id: id, ep: String(n) },
                })
            }
        } catch (e) {
            $print('黄果 getTracks 失败: ' + e)
        }
    }

    if (!tracks.length) {
        tracks.push({ name: '第1集', pan: '', ext: { id: id, ep: '1' } })
    }

    return jsonify({ list: [{ title: '默认分组', tracks: tracks }] })
}

async function getPlayinfo(ext) {
    ext = argsify(ext)
    const id = String(ext.id != null && ext.id !== '' ? ext.id : (ext.vod_id != null ? ext.vod_id : ''))
    const ep = String(ext.ep || '1')

    const headers = {
        'User-Agent': UA,
        'Referer': site() + '/',
        'Origin': site(),
    }
    let playurl = ''

    if (id) {
        try {
            const d = parseBody(await apiPost(
                '/api/videos/' + encodeURIComponent(id) + '/episodes/' + encodeURIComponent(ep) + '/playback',
                {}
            ))
            if (d && d.status === 1) {
                const data = d.data || {}
                const streams = data.streams || {}
                playurl = String(streams.main || streams.hevc || streams.preview || '')
                // CDN 鉴权头（x-cdn-auth / x-cdn-app），当前不强制但按网页端口径带上
                const cdn = data.cdn || {}
                if (cdn.m3u8Enabled && cdn.authKey && cdn.authValue) {
                    headers[String(cdn.authKey)] = String(cdn.authValue)
                    if (cdn.app != null) headers['x-cdn-app'] = String(cdn.app)
                }
            } else {
                $print('黄果 取流失败: id=' + id + ' ep=' + ep + ' msg=' + ((d && d.msg) || ''))
            }
        } catch (e) {
            $print('黄果 getPlayinfo 失败: ' + e)
        }
    }

    $print('黄果 播放地址: ' + playurl.slice(0, 120))
    return jsonify({ urls: [playurl], headers: [headers] })
}

async function search(ext) {
    ext = argsify(ext)
    const text = String(ext.text || '').trim()
    const page = Number(ext.page || 1) || 1
    const cards = []

    if (!text) return jsonify({ list: cards })

    try {
        const d = parseBody(await apiGet('/api/search?q=' + encodeURIComponent(text) + '&page=' + page))
        const items = (d && d.data && d.data.items) || []
        for (let i = 0; i < items.length; i++) {
            const c = toCard(items[i])
            if (c) cards.push(c)
        }
    } catch (e) {
        $print('黄果 search 失败: ' + e)
    }

    $print('黄果 搜索「' + text + '」第' + page + '页 → ' + cards.length + ' 条')
    return jsonify({ list: cards })
}
