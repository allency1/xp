const cheerio = createCheerio()

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

let appConfig = {
    ver: 1,
    title: 'X视频榜',
    site: 'https://twitter-ero-video-ranking.com',
    tabs: [
        { name: '每日-点赞',     ext: { range: 'daily',   sort: 'favorite' } },
        { name: '每日-观看',     ext: { range: 'daily',   sort: 'pv' } },
        { name: '每周-点赞',     ext: { range: 'weekly',  sort: 'favorite' } },
        { name: '每周-观看',     ext: { range: 'weekly',  sort: 'pv' } },
        { name: '每月-点赞',     ext: { range: 'monthly', sort: 'favorite' } },
        { name: '每月-观看',     ext: { range: 'monthly', sort: 'pv' } },
        { name: '所有时间-点赞', ext: { range: 'all',     sort: 'favorite' } },
        { name: '所有时间-观看', ext: { range: 'all',     sort: 'pv' } },
    ],
}

async function getConfig(ext) {
    if (ext) {
        try {
            const cfg = argsify(ext)
            if (cfg.site) appConfig.site = cfg.site.replace(/\/$/, '')
        } catch (e) {}
    }
    return jsonify(appConfig)
}

function fmtDuration(sec) {
    if (!sec) return ''
    sec = Math.floor(sec)
    const m = Math.floor(sec / 60)
    const s = sec % 60
    return m + ':' + (s < 10 ? '0' + s : s)
}

async function getCards(ext) {
    ext = argsify(ext)
    let cards = []
    const page = ext.page || 1
    const range = ext.range || 'daily'
    const sort = ext.sort || 'favorite'
    const category = ext.category || ''

    const url = `${appConfig.site}/api/media?range=${range}&page=${page}&per_page=20&category=${encodeURIComponent(category)}&ids=&isAnimeOnly=0&sort=${sort}`

    $print('X视频榜 列表: ' + url)

    let data
    try {
        const resp = await $fetch.get(url, {
            headers: { 'User-Agent': UA, 'Referer': appConfig.site + '/zh-CN' },
            timeout: 15000,
        })
        data = typeof resp.data === 'string' ? JSON.parse(resp.data) : resp.data
    } catch (e) {
        $print('请求失败: ' + e)
        return jsonify({ list: [] })
    }

    const items = (data && data.items) || []
    items.forEach(it => {
        if (!it.url) return
        const title = (it.tweet_account ? '@' + it.tweet_account : '') || it.url_cd || ''
        const remarks = fmtDuration(it.time) + (it.favorite ? '  ♥' + it.favorite : '')
        cards.push({
            vod_id: it.url_cd || String(it.id),
            vod_name: title || '视频',
            vod_pic: it.thumbnail || '',
            vod_remarks: remarks,
            ext: { url: it.url, referer: it.tweet_url || (appConfig.site + '/zh-CN/movie/' + (it.url_cd || '')) },
        })
    })

    $print('✓ 解析到 ' + cards.length + ' 个视频')
    return jsonify({ list: cards })
}

async function getTracks(ext) {
    ext = argsify(ext)
    return jsonify({
        list: [{
            title: 'X视频榜',
            tracks: [{
                name: '播放',
                pan: '',
                ext: { url: ext.url, referer: ext.referer || '' },
            }],
        }],
    })
}

async function getPlayinfo(ext) {
    ext = argsify(ext)
    return jsonify({
        urls: [ext.url],
        headers: {
            'User-Agent': UA,
            'Referer': ext.referer || 'https://twitter.com/',
        },
    })
}

async function search(ext) {
    ext = argsify(ext)
    let cards = []
    const text = (ext.text || '').trim()
    const page = ext.page || 1

    // 站点无文本搜索，将关键字按 tag code 过滤
    const url = `${appConfig.site}/api/media?range=all&page=${page}&per_page=20&category=${encodeURIComponent(text)}&ids=&isAnimeOnly=0&sort=favorite`
    $print('X视频榜 搜索: ' + url)

    let data
    try {
        const resp = await $fetch.get(url, {
            headers: { 'User-Agent': UA, 'Referer': appConfig.site + '/zh-CN' },
            timeout: 15000,
        })
        data = typeof resp.data === 'string' ? JSON.parse(resp.data) : resp.data
    } catch (e) {
        $print('搜索失败: ' + e)
        return jsonify({ list: [] })
    }

    const items = (data && data.items) || []
    items.forEach(it => {
        if (!it.url) return
        const title = (it.tweet_account ? '@' + it.tweet_account : '') || it.url_cd || ''
        const remarks = fmtDuration(it.time) + (it.favorite ? '  ♥' + it.favorite : '')
        cards.push({
            vod_id: it.url_cd || String(it.id),
            vod_name: title || '视频',
            vod_pic: it.thumbnail || '',
            vod_remarks: remarks,
            ext: { url: it.url, referer: it.tweet_url || '' },
        })
    })

    $print('✓ 搜索到 ' + cards.length + ' 个结果')
    return jsonify({ list: cards })
}
