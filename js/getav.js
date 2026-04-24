const cheerio = createCheerio()

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

let appConfig = {
    ver: 1,
    title: 'GetAV测试',
    site: 'https://getav.net',
}

async function getConfig() {
    let config = appConfig
    config.tabs = [
        { name: '测试', ext: { url: appConfig.site + '/zh/latest' }, ui: 1 },
    ]
    return jsonify(config)
}

async function getCards(ext) {
    // 先返回硬编码数据测试
    let cards = [
        {
            vod_id: 'test-1',
            vod_name: '测试视频1',
            vod_pic: 'https://static.worldstatic.com/images/cover/thumb/SONE-689_61db81ea_thumb.avif',
            vod_remarks: '2:00:00',
            ext: {
                url: 'https://getav.net/zh/videos/sone-689',
            },
        },
        {
            vod_id: 'test-2',
            vod_name: '测试视频2',
            vod_pic: 'https://static.worldstatic.com/images/cover/thumb/IPZZ-703_a0c7934a_thumb.avif',
            vod_remarks: '1:30:00',
            ext: {
                url: 'https://getav.net/zh/videos/ipzz-703',
            },
        },
    ]

    return jsonify({ list: cards })
}

async function getTracks(ext) {
    return jsonify({
        list: [{
            title: '播放',
            tracks: [{
                name: '播放',
                pan: '',
                ext: { url: ext.url },
            }],
        }],
    })
}

async function getPlayinfo(ext) {
    return jsonify({
        urls: [],
        headers: {}
    })
}

async function search(ext) {
    return jsonify({ list: [] })
}
