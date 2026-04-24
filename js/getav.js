const cheerio = createCheerio()

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'

let appConfig = {
    ver: 1,
    title: 'GetAV调试',
    site: 'https://getav.net',
}

async function getConfig() {
    let config = appConfig
    config.tabs = [
        { name: '最新', ext: { url: appConfig.site + '/zh/latest' }, ui: 1 },
    ]
    return jsonify(config)
}

async function getCards(ext) {
    ext = argsify(ext)
    let cards = []
    let url = ext.url || appConfig.site + '/zh/latest'

    try {
        const response = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
                'Referer': appConfig.site,
            },
            timeout: 15000,
        })
        
        const data = response.data
        const $ = cheerio.load(data)
        
        // 查找所有包含 class="group" 的 div
        const groups = $('div[class*="group"]')
        
        // 如果没找到，返回调试信息
        if (groups.length === 0) {
            cards.push({
                vod_id: 'debug-1',
                vod_name: '调试: 未找到 group 元素',
                vod_pic: '',
                vod_remarks: '页面大小: ' + data.length + ' 字节',
                ext: { url: url },
            })
            
            // 检查是否有视频链接
            const videoLinks = $('a[href*="/videos/"]')
            cards.push({
                vod_id: 'debug-2',
                vod_name: '调试: 视频链接数量',
                vod_pic: '',
                vod_remarks: videoLinks.length + ' 个',
                ext: { url: url },
            })
            
            return jsonify({ list: cards })
        }
        
        // 解析视频卡片
        groups.each((index, element) => {
            if (index >= 20) return false // 只取前20个
            
            const $parent = $(element)
            const $link = $parent.find('a[href*="/videos/"]').first()
            const href = $link.attr('href')
            
            if (!href) return
            
            const match = href.match(/\/videos\/([^\/\?]+)/)
            const vod_id = match ? match[1] : ''
            
            if (!vod_id) return
            
            const $h3 = $parent.find('h3')
            const title = $h3.attr('title') || $h3.text().trim() || '无标题'
            
            const $img = $parent.find('img').first()
            const cover = $img.attr('src') || ''
            
            const fullUrl = href.startsWith('http') ? href : appConfig.site + href
            
            cards.push({
                vod_id: vod_id,
                vod_name: title,
                vod_pic: cover,
                vod_remarks: '',
                ext: { url: fullUrl },
            })
        })
        
    } catch (e) {
        cards.push({
            vod_id: 'error',
            vod_name: '错误: ' + e.toString(),
            vod_pic: '',
            vod_remarks: '',
            ext: { url: url },
        })
    }

    return jsonify({ list: cards })
}

async function getTracks(ext) {
    ext = argsify(ext)
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
