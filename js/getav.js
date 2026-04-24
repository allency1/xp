const cheerio = createCheerio()

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

let appConfig = {
    ver: 1,
    title: 'GetAV测试',
    site: 'https://getav.net',
    tabs: [
        { name: '热门', ext: { url: 'https://getav.net/zh/hot' } },
    ],
}

async function getConfig(ext) {
    return jsonify(appConfig)
}

async function getCards(ext) {
    ext = argsify(ext)
    let cards = []

    // 硬编码测试数据
    cards.push({
        vod_id: 'test-001',
        vod_name: '测试视频1',
        vod_pic: 'https://static.worldstatic.com/images/cover/thumb/SONE-201_cd1cebfe_thumb.avif',
        vod_remarks: '01:30:00',
        ext: {
            url: 'https://getav.net/zh/videos/test-001',
            id: 'test-001',
        },
    })

    cards.push({
        vod_id: 'test-002',
        vod_name: '测试视频2',
        vod_pic: 'https://static.worldstatic.com/images/cover/thumb/MIDA-574_d587dd0a_thumb.avif',
        vod_remarks: '02:00:00',
        ext: {
            url: 'https://getav.net/zh/videos/test-002',
            id: 'test-002',
        },
    })

    return jsonify({ list: cards })
}

async function getTracks(ext) {
    ext = argsify(ext)

    return jsonify({
        list: [{
            title: 'GetAV',
            tracks: [{
                name: '播放',
                pan: '',
                ext: { url: 'https://example.com/test.m3u8' },
            }],
        }],
    })
}

async function getPlayinfo(ext) {
    ext = argsify(ext)

    return jsonify({
        urls: ['https://example.com/test.m3u8'],
        headers: {
            'User-Agent': UA,
            'Referer': 'https://getav.net/',
        },
    })
}

async function search(ext) {
    ext = argsify(ext)

    return jsonify({ list: [] })
}
