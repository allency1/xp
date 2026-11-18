/**
 * rv.js — 肉视频（rou.video）XPTV 源
 * 修订: 2026-11-17
 *
 * 站点整站改版了（不再是 Next.js），原来的写法全部失效：
 *   - 列表：旧选择器 .grid.grid-cols-2.mb-6 > div 一个卡片都匹配不到，所以列表/封面都出不来。
 *     现在每个影片是一个 <a href="/v/{id}">，里面第一张 <img> 是封面、<h3> 是标题、右下角 <span> 是时长。
 *   - 详情：没有 __NEXT_DATA__ 了，播放信息在页面内嵌数据的 ev:{d:"…",k:N} 里（解码方式没变）。
 *     解出来的 videoUrl 现在是相对路径 /api/hls/{id}，要补上域名。
 *
 * 播放目前在 XPTV 里放不了：/api/hls/{id} 会跳到一个 .png 地址，播放列表和每个分片都被包在
 * PNG 图片里（站点自己的网页播放器会拆出来），普通播放器不认。脚本里没有办法绕过去。
 */

const cheerio = createCheerio()
const CryptoJS = createCryptoJS()

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0'

let appConfig = {
    ver: 20261117,
    title: '肉视频',
    site: 'https://rou.video',
    tabs: [
        { name: '国产AV',   ext: { url: 'https://rou.video/t/國產AV' } },
        { name: '探花',     ext: { url: 'https://rou.video/t/探花' } },
        { name: '自拍流出', ext: { url: 'https://rou.video/t/自拍流出' } },
        { name: 'OnlyFans', ext: { url: 'https://rou.video/t/OnlyFans' } },
        { name: '日本AV',   ext: { url: 'https://rou.video/t/日本' } },
        // 站点已经没有 /t/91 这个标签了（404），换成现在还在的两个
        { name: '麻豆传媒', ext: { url: 'https://rou.video/t/麻豆傳媒' } },
        { name: '91制片厂', ext: { url: 'https://rou.video/t/91製片廠' } },
    ],
}

async function getConfig() {
    return jsonify(appConfig)
}

function clean(t) {
    return String(t == null ? '' : t).replace(/\s+/g, ' ').trim()
}

function absUrl(u) {
    u = String(u == null ? '' : u).trim()
    if (!u) return ''
    if (/^https?:\/\//i.test(u)) return u
    if (u.indexOf('//') === 0) return 'https:' + u
    return appConfig.site + (u.charAt(0) === '/' ? '' : '/') + u
}

async function getHtml(url) {
    const { data } = await $fetch.get(url, {
        headers: { 'User-Agent': UA, 'Referer': appConfig.site + '/' },
        timeout: 15000,
    })
    return typeof data === 'string' ? data : (data == null ? '' : JSON.stringify(data))
}

function parseCards(html) {
    const $ = cheerio.load(html)
    const cards = []
    const seen = {}

    $('a[href^="/v/"]').each((_, element) => {
        const a = $(element)
        const href = a.attr('href') || ''
        // 只要影片链接 /v/{id}，不要 /v（视频库）之类的导航
        if (!/^\/v\/[A-Za-z0-9_-]+$/.test(href) || seen[href]) return

        const cover = a.find('img').first().attr('src') || ''
        const title = clean(a.find('h3').first().text()) || clean(a.find('img[alt!=""]').first().attr('alt'))
        // 没有封面也没有标题的是页面上别处的文字链接
        if (!title || !cover) return
        seen[href] = true

        cards.push({
            vod_id: href,
            vod_name: title,
            vod_pic: absUrl(cover),
            vod_remarks: clean(a.find('.relative span').last().text()),
            ext: { url: appConfig.site + href },
        })
    })

    return cards
}

async function getCards(ext) {
    ext = argsify(ext)
    let cards = []
    let { page = 1, url } = ext

    if (page > 1) {
        url += `?order=createdAt&page=${page}`
    }

    try {
        cards = parseCards(await getHtml(encodeURI(decodeURI(url))))
    } catch (e) {
        $print('肉视频 列表请求失败: ' + e)
    }

    $print('肉视频 第' + page + '页 → ' + cards.length + ' 条')
    return jsonify({ list: cards })
}

async function getTracks(ext) {
    ext = argsify(ext)
    const url = ext.url
    if (!url) return jsonify({ list: [{ title: '默认分组', tracks: [] }] })

    return jsonify({
        list: [{
            title: '默认分组',
            tracks: [{
                name: '播放',
                pan: '',
                ext: { url: url },
            }],
        }],
    })
}

async function getPlayinfo(ext) {
    ext = argsify(ext)
    const url = ext.url
    let playUrl = ''

    try {
        const data = await getHtml(url)
        // 页面内嵌数据里的 ev:$R[92]={d:"…",k:11}
        const m = data.match(/\bev:(?:\$R\[\d+\]=)?\{d:"([^"]+)",k:(-?\d+)/)
        if (m) {
            const raw = CryptoJS.enc.Base64.parse(m[1]).toString(CryptoJS.enc.Latin1)
            const k = parseInt(m[2], 10)
            let str = ''
            for (let i = 0; i < raw.length; i++) {
                str += String.fromCharCode((raw.charCodeAt(i) - k + 256) % 256)
            }
            playUrl = absUrl(JSON.parse(str).videoUrl)
        } else {
            $print('肉视频 页面里没有找到播放信息: ' + url)
        }
    } catch (e) {
        $print('肉视频 播放解析失败: ' + e)
    }

    $print('肉视频 播放地址: ' + playUrl)
    return jsonify({
        urls: [playUrl],
        headers: [{ 'User-Agent': UA, 'Referer': appConfig.site + '/' }],
    })
}

async function search(ext) {
    ext = argsify(ext)
    let cards = []
    const text = encodeURIComponent(ext.text || '')
    const page = ext.page || 1
    const url = `${appConfig.site}/search?q=${text}&t=&page=${page}`

    try {
        cards = parseCards(await getHtml(url))
    } catch (e) {
        $print('肉视频 搜索请求失败: ' + e)
    }

    return jsonify({ list: cards })
}
