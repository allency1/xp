/**
 * motv.js — MOTV（motv.app）XPTV 源
 * 修订: 2026-11-17
 *
 * 站点换了模板，原来的写法全部失效：
 *   - 列表：/vodshow/{tid}--------{页}---/ 现在是 404，所以列表/封面都出不来。
 *     现在按分类名取：/label/vodclass.html?vc_class={分类}&page={页}
 *     每个影片是 li.hl-list-item，封面在 a.hl-item-thumb 的 data-original，时长在 .remarks
 *   - 搜索：/vod/search.html?wd={词}，第 N 页是 /vod/search/page/N/wd/{词}.html
 *   - 播放：播放页 /vod/play/id/{id}/sid/1/nid/1.html 里的 player_aaaa.url 现在是一个
 *     /watch/… 播放器页面（必须带 Referer 才给），真正的 m3u8 地址写在那个页面的 var src='…' 里
 *
 * 一部分影片站点只给会员看（播放页显示“您没有权限访问此数据，请升级会员”），游客播不了。
 * 列表里看不出哪些是会员片，点进去以后选集名会带“(需会员)”。
 */

const cheerio = createCheerio()

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

let appConfig = {
    ver: 20261117,
    title: 'MOTV',
    site: 'https://motv.app/cn',
}

async function getConfig() {
    let config = appConfig
    config.tabs = await getTabs()
    return jsonify(config)
}

async function getTabs() {
    return [
        { name: '最新',     ext: { cls: '' } },
        { name: '日本有码', ext: { cls: '日本,有码' } },
        { name: '日本无码', ext: { cls: '日本,无码' } },
        { name: '日本HD',   ext: { cls: '日本HD' } },
        { name: '欧美',     ext: { cls: '欧美' } },
        { name: '欧美HD',   ext: { cls: '欧美HD' } },
        { name: '国产',     ext: { cls: '中国' } },
        { name: '香港',     ext: { cls: '香港' } },
        { name: '动漫',     ext: { cls: '动漫' } },
        { name: 'Onlyfan',  ext: { cls: 'Onlyfan' } },
        { name: 'AI漫剧',   ext: { cls: 'AI漫剧' } },
    ]
}

function originOf(u) {
    const m = String(u == null ? '' : u).match(/^(https?:\/\/[^\/?#]+)/i)
    return m ? m[1] : ''
}

// 站内链接是 /cn/… 开头的绝对路径，拼到域名上（不是拼到 appConfig.site 上，那样会多一个 /cn）
function absUrl(u, base) {
    u = String(u == null ? '' : u).trim()
    if (!u || u.indexOf('javascript:') === 0) return ''
    if (/^https?:\/\//i.test(u)) return u
    if (u.indexOf('//') === 0) return 'https:' + u
    return originOf(base || appConfig.site) + (u.charAt(0) === '/' ? '' : '/') + u
}

async function getHtml(url, referer) {
    const { data } = await $fetch.get(url, {
        headers: { 'User-Agent': UA, 'Referer': referer || appConfig.site + '/' },
        timeout: 15000,
    })
    return typeof data === 'string' ? data : (data == null ? '' : JSON.stringify(data))
}

function parseCards(html) {
    const $ = cheerio.load(html)
    const cards = []
    const seen = {}

    $('li.hl-list-item').each((_, element) => {
        const thumb = $(element).find('a.hl-item-thumb').first()
        const href = thumb.attr('href') || $(element).find('.hl-item-title a').attr('href') || ''
        const idMatch = href.match(/\/vod\/(?:play|detail)\/id\/(\d+)/)
        if (!idMatch || seen[idMatch[1]]) return

        const title = (thumb.attr('title') || $(element).find('.hl-item-title').text() || '').trim()
        if (!title) return
        seen[idMatch[1]] = true

        cards.push({
            vod_id: idMatch[1],
            vod_name: title,
            vod_pic: absUrl(thumb.attr('data-original') || thumb.find('img').attr('src') || ''),
            vod_remarks: $(element).find('.remarks').first().text().trim(),
            ext: { url: absUrl(href) },
        })
    })

    return cards
}

async function getCards(ext) {
    ext = argsify(ext)
    let cards = []
    const page = Math.max(1, parseInt(ext.page, 10) || 1)
    const cls = ext.cls || ''

    let url = appConfig.site + '/label/vodclass.html?page=' + page
    if (cls) url += '&vc_class=' + encodeURIComponent(cls).replace(/%2C/g, ',')

    $print('MOTV 获取列表: ' + url)

    try {
        cards = parseCards(await getHtml(url))
    } catch (error) {
        $print('✗ 请求失败: ' + error)
    }

    $print('✓ 解析到 ' + cards.length + ' 个')
    return jsonify({ list: cards })
}

async function getTracks(ext) {
    ext = argsify(ext)
    const url = ext.url || ''
    const idMatch = url.match(/\/vod\/(?:play|detail)\/id\/(\d+)/)
    let groups = []

    $print('MOTV 获取播放线路: ' + url)

    if (idMatch) {
        const playUrl = appConfig.site + '/vod/play/id/' + idMatch[1] + '/sid/1/nid/1.html'
        // 一部分影片站点只给会员看：播放页上没有播放信息，只有一句“您没有权限访问此数据，请升级会员”
        let gated = false
        try {
            // 播放页上同一部片子的所有选集链接：/vod/play/id/{id}/sid/{线路}/nid/{集}.html
            const $ = cheerio.load(await getHtml(playUrl))
            gated = $('.hl-play-gate').length > 0
            const mark = gated ? '(需会员)' : ''
            const bySid = {}
            const order = []
            $('a[href*="/vod/play/id/' + idMatch[1] + '/sid/"]').each((_, e) => {
                const href = $(e).attr('href') || ''
                const m = href.match(/\/sid\/(\d+)\/nid\/(\d+)/)
                const name = $(e).text().trim()
                if (!m || !name || name.length > 20) return
                if (!bySid[m[1]]) {
                    bySid[m[1]] = { seen: {}, tracks: [] }
                    order.push(m[1])
                }
                if (bySid[m[1]].seen[m[2]]) return
                bySid[m[1]].seen[m[2]] = true
                bySid[m[1]].tracks.push({ name: name + mark, pan: '', ext: { url: absUrl(href) } })
            })
            groups = order.map((sid, i) => ({ title: '播放源' + (i + 1), tracks: bySid[sid].tracks }))
        } catch (error) {
            $print('✗ 请求失败: ' + error)
        }
        if (gated) $print('✗ 这部影片站点只给会员看，游客播不了')
        if (!groups.length) {
            groups = [{ title: 'MOTV', tracks: [{ name: '播放' + (gated ? '(需会员)' : ''), pan: '', ext: { url: playUrl } }] }]
        }
    }

    $print('✓ 总共找到 ' + groups.length + ' 个播放源')
    return jsonify({ list: groups })
}

async function getPlayinfo(ext) {
    ext = argsify(ext)
    const url = ext.url
    let playurl = ''

    $print('MOTV 播放解析: ' + url)

    try {
        const data = await getHtml(url)

        const playerMatch = data.match(/player_aaaa\s*=\s*(\{[\s\S]*?\})\s*<\/script>/)
        if (playerMatch) {
            const playerConfig = JSON.parse(playerMatch[1])
            let rawUrl = playerConfig.url || ''
            if (playerConfig.encrypt == 1 && rawUrl) {
                rawUrl = decodeURIComponent(atob(rawUrl))
            } else if (playerConfig.encrypt == 2 && rawUrl) {
                rawUrl = decodeURIComponent(rawUrl)
            }
            rawUrl = absUrl(rawUrl)

            if (rawUrl.indexOf('/watch/') > -1) {
                // 播放器页面：不带 Referer 是 401；m3u8 地址在 var src='…' 里，相对于这个页面的域名
                const page = await getHtml(rawUrl, url)
                const srcMatch = page.match(/\bsrc\s*=\s*['"]([^'"]+\.m3u8[^'"]*)['"]/)
                if (srcMatch) {
                    playurl = absUrl(srcMatch[1], rawUrl)
                } else {
                    $print('✗ 播放器页面里没有找到 m3u8')
                }
            } else {
                playurl = rawUrl
            }
        } else if (data.indexOf('hl-play-gate') > -1) {
            $print('✗ 这部影片站点只给会员看，游客播不了')
        } else {
            $print('✗ 播放页里没有找到播放信息')
        }
    } catch (error) {
        $print('✗ 播放解析失败: ' + error)
    }

    $print('MOTV 播放地址: ' + playurl.substring(0, 120))
    return jsonify({
        urls: [playurl],
        headers: [{ 'User-Agent': UA, 'Referer': originOf(playurl || url) + '/' }],
    })
}

async function search(ext) {
    ext = argsify(ext)
    let cards = []
    const text = encodeURIComponent(String(ext.text || '').trim())
    const page = Math.max(1, parseInt(ext.page, 10) || 1)
    if (!text) return jsonify({ list: cards })

    const url = page > 1
        ? `${appConfig.site}/vod/search/page/${page}/wd/${text}.html`
        : `${appConfig.site}/vod/search.html?wd=${text}`

    $print('MOTV 搜索: ' + url)

    try {
        cards = parseCards(await getHtml(url))
    } catch (error) {
        $print('✗ 搜索失败: ' + error)
    }

    $print('✓ 搜索到 ' + cards.length + ' 个结果')
    return jsonify({ list: cards })
}
