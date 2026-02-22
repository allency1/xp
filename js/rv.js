const cheerio = createCheerio()

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

let appConfig = {
    ver: 1,
    title: '肉视频',
    site: 'https://rou.video/home',
}

async function getConfig() {
    let config = appConfig
    config.tabs = await getTabs()
    return jsonify(config)
}

async function getTabs() {
    return [
        { name: '首页',     ext: { tag: '',         page: 1 } },
        { name: '国产AV',   ext: { tag: '國產AV',   page: 1 } },
        { name: '麻豆传媒', ext: { tag: '麻豆傳媒', page: 1 } },
        { name: '自拍流出', ext: { tag: '自拍流出', page: 1 } },
        { name: '探花',     ext: { tag: '探花',     page: 1 } },
        { name: '杏吧传媒', ext: { tag: '杏吧傳媒', page: 1 } },
        { name: '糖心Vlog', ext: { tag: '糖心Vlog', page: 1 } },
    ]
}

async function getCards(ext) {
    ext = argsify(ext)
    let cards = []
    let { tag = '', page = 1 } = ext

    const { data } = await $fetch.get(appConfig.site + '/api/v/watching', {
        headers: {
            'User-Agent': UA,
            'Referer': appConfig.site + '/home',
            'Accept': 'application/json',
        },
        timeout: 15000,
    })

    if (!Array.isArray(data)) return jsonify({ list: [] })

    data.forEach(video => {
        if (tag && video.tags && !video.tags.includes(tag)) return
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

async function getTracks(ext) {
    ext = argsify(ext)
    const videoId = ext.id

    const { data } = await $fetch.get(appConfig.site + '/v/' + videoId, {
        headers: {
            'User-Agent': UA,
            'Referer': appConfig.site + '/home',
        },
        timeout: 15000,
    })

    const $ = cheerio.load(data)
    const nextDataText = $('#__NEXT_DATA__').html() || ''
    if (!nextDataText) return jsonify({ list: [{ title: '默认分组', tracks: [] }] })

    const nextData = JSON.parse(nextDataText)
    const ev = nextData.props && nextData.props.pageProps && nextData.props.pageProps.ev
    if (!ev || !ev.d || ev.k === undefined) return jsonify({ list: [{ title: '默认分组', tracks: [] }] })

    const videoUrl = decryptEv(ev)

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
    let cards = []
    const text = (ext.text || '').toLowerCase()

    const { data } = await $fetch.get(appConfig.site + '/api/v/watching', {
        headers: {
            'User-Agent': UA,
            'Referer': appConfig.site + '/home',
            'Accept': 'application/json',
        },
        timeout: 15000,
    })

    if (Array.isArray(data)) {
        data.forEach(video => {
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
    }

    return jsonify({ list: cards })
}

function decryptEv(ev) {
    const raw = atob(ev.d)
    const k = ev.k
    const bytes = new Uint8Array(raw.length)
    for (let i = 0; i < raw.length; i++) {
        bytes[i] = (raw.charCodeAt(i) - k + 256) % 256
    }
    const obj = JSON.parse(new TextDecoder().decode(bytes))
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
