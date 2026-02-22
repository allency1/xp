const cheerio = createCheerio()

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

let appConfig = {
    ver: 1,
    title: '肉视频',
    site: 'https://rou.video',
}

async function getConfig() {
    let config = appConfig
    config.tabs = await getTabs()
    return jsonify(config)
}

async function getTabs() {
    return [
        { name: '最新',     ext: { field: 'latestVideos' } },
        { name: '国产AV',   ext: { field: 'dailyHotCNAV' } },
        { name: '自拍流出', ext: { field: 'dailyHotSelfie' } },
        { name: '91',       ext: { field: 'dailyHot91' } },
        { name: 'OnlyFans', ext: { field: 'dailyOnlyFans' } },
        { name: '日本AV',   ext: { field: 'dailyJV' } },
        { name: '国产热门', ext: { field: 'hotCNAV' } },
        { name: '自拍热门', ext: { field: 'hotSelfie' } },
        { name: '91热门',   ext: { field: 'hot91' } },
    ]
}

async function getCards(ext) {
    ext = argsify(ext)
    const field = ext.field || 'latestVideos'

    const { data } = await $fetch.get(appConfig.site + '/home', {
        headers: { 'User-Agent': UA },
        timeout: 15000,
    })

    const m = data.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
    if (!m) return jsonify({ list: [] })

    const nd = JSON.parse(m[1])
    const videos = nd.props && nd.props.pageProps && nd.props.pageProps[field]
    if (!Array.isArray(videos)) return jsonify({ list: [] })

    const cards = videos.map(video => ({
        vod_id: video.id,
        vod_name: video.nameZh || video.name,
        vod_pic: video.coverImageUrl || '',
        vod_remarks: formatDuration(video.duration),
        ext: { url: appConfig.site + '/v/' + video.id, id: video.id },
    }))

    return jsonify({ list: cards })
}

async function getTracks(ext) {
    ext = argsify(ext)
    // 支持从 id 或 url 里取视频 id
    let videoId = ext.id || ''
    if (!videoId && ext.url) {
        const m0 = ext.url.match(/\/v\/([^/?]+)/)
        if (m0) videoId = m0[1]
    }
    $print('getTracks videoId: ' + videoId)

    const { data } = await $fetch.get(appConfig.site + '/v/' + videoId, {
        headers: {
            'User-Agent': UA,
            'Referer': appConfig.site + '/home',
        },
        timeout: 15000,
    })

    $print('页面长度: ' + data.length)

    const m = data.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
    if (!m) {
        $print('未找到 __NEXT_DATA__')
        return jsonify({ list: [{ title: '默认分组', tracks: [] }] })
    }

    $print('找到 __NEXT_DATA__, 长度: ' + m[1].length)

    let nextData
    try {
        nextData = JSON.parse(m[1])
    } catch(e) {
        $print('JSON.parse 失败: ' + e)
        return jsonify({ list: [{ title: '默认分组', tracks: [] }] })
    }

    const ev = nextData.props && nextData.props.pageProps && nextData.props.pageProps.ev
    $print('ev: ' + JSON.stringify(ev))

    if (!ev || !ev.d || ev.k === undefined) {
        $print('ev 无效')
        return jsonify({ list: [{ title: '默认分组', tracks: [] }] })
    }

    let videoUrl
    try {
        videoUrl = decryptEv(ev)
    } catch(e) {
        $print('decryptEv 失败: ' + e)
        return jsonify({ list: [{ title: '默认分组', tracks: [] }] })
    }

    $print('videoUrl: ' + videoUrl)

    if (!videoUrl) return jsonify({ list: [{ title: '默认分组', tracks: [] }] })

    return jsonify({
        list: [{
            title: '默认分组',
            tracks: [{
                name: '播放',
                pan: '',
                ext: { url: videoUrl },
            }],
        }],
    })
}

async function getPlayinfo(ext) {
    ext = argsify(ext)
    const url = ext.url
    return jsonify({
        urls: [url],
        headers: {
            'User-Agent': UA,
            'Referer': appConfig.site + '/',
        },
    })
}

async function search(ext) {
    ext = argsify(ext)
    const text = (ext.text || '').toLowerCase()
    const cards = []

    const { data } = await $fetch.get(appConfig.site + '/home', {
        headers: { 'User-Agent': UA },
        timeout: 15000,
    })

    const m = data.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
    if (!m) return jsonify({ list: [] })

    const nd = JSON.parse(m[1])
    const pp = nd.props && nd.props.pageProps || {}
    const allVideos = []
    const seen = {}

    for (const key of Object.keys(pp)) {
        if (Array.isArray(pp[key])) {
            pp[key].forEach(v => {
                if (v && v.id && !seen[v.id]) {
                    seen[v.id] = true
                    allVideos.push(v)
                }
            })
        }
    }

    allVideos.forEach(video => {
        const name = (video.nameZh || video.name || '').toLowerCase()
        if (name.indexOf(text) === -1) return
        cards.push({
            vod_id: video.id,
            vod_name: video.nameZh || video.name,
            vod_pic: video.coverImageUrl || '',
            vod_remarks: formatDuration(video.duration),
            ext: { id: video.id },
        })
    })

    return jsonify({ list: cards })
}

function decryptEv(ev) {
    const raw = atob(ev.d)
    const k = ev.k
    let str = ''
    for (let i = 0; i < raw.length; i++) {
        str += String.fromCharCode((raw.charCodeAt(i) - k + 256) % 256)
    }
    const obj = JSON.parse(str)
    return obj.videoUrl || ''
}

function formatDuration(seconds) {
    if (!seconds) return ''
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)
    const pad = n => n < 10 ? '0' + n : '' + n
    if (h > 0) return h + ':' + pad(m) + ':' + pad(s)
    return pad(m) + ':' + pad(s)
}
