const cheerio = createCheerio()

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

let appConfig = {
    ver: 1,
    title: 'Hanime1',
    site: 'https://hanime1.me',
}

async function getConfig() {
    let config = appConfig
    config.tabs = await getTabs()
    return jsonify(config)
}

async function getTabs() {
    let list = [
        {
            name: '推荐',
            ext: {
                url: appConfig.site + '/',
            },
        },
        {
            name: '里番',
            ext: {
                url: appConfig.site + '/search?genre=裏番',
            },
        },
        {
            name: '泡面番',
            ext: {
                url: appConfig.site + '/search?genre=泡麵番',
            },
        },
        {
            name: 'Motion Anime',
            ext: {
                url: appConfig.site + '/search?genre=Motion Anime',
            },
        },
        {
            name: '3DCG',
            ext: {
                url: appConfig.site + '/search?genre=3DCG',
            },
        },
        {
            name: '2.5D',
            ext: {
                url: appConfig.site + '/search?genre=2.5D',
            },
        },
        {
            name: '2D动画',
            ext: {
                url: appConfig.site + '/search?genre=2D動畫',
            },
        },
        {
            name: 'AI生成',
            ext: {
                url: appConfig.site + '/search?genre=AI生成',
            },
        },
        {
            name: 'MMD',
            ext: {
                url: appConfig.site + '/search?genre=MMD',
            },
        },
        {
            name: 'Cosplay',
            ext: {
                url: appConfig.site + '/search?genre=Cosplay',
            },
        },
    ]
    return list
}

async function getCards(ext) {
    ext = argsify(ext)
    let cards = []
    let { page = 1, url } = ext

    if (page > 1 && url) {
        url = url + '&page=' + page
    }

    const { data } = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
            'Referer': appConfig.site,
        },
    })

    const $ = cheerio.load(data)

    // 解析桌面端视频卡片
    $('.horizontal-card').each((_, element) => {
        const linkElem = $(element).find('a.video-link')
        const href = linkElem.attr('href')
        const title = $(element).find('.title').text().trim()
        const cover = $(element).find('.main-thumb').attr('src')
        const duration = $(element).find('.duration').text().trim()

        if (href && title) {
            const fullUrl = href.startsWith('http') ? href : appConfig.site + href
            const vidMatch = href.match(/v=(\d+)/)
            const vod_id = vidMatch ? vidMatch[1] : href

            cards.push({
                vod_id: vod_id,
                vod_name: title,
                vod_pic: cover,
                vod_remarks: duration,
                ext: {
                    url: fullUrl,
                },
            })
        }
    })

    // 解析 video-item-container
    $('.video-item-container').each((_, element) => {
        const linkElem = $(element).find('a')
        const href = linkElem.attr('href')
        const title = $(element).find('.title').text().trim()
        const cover = $(element).find('.main-thumb').attr('src')
        const duration = $(element).find('.duration').text().trim()

        if (href && title) {
            const fullUrl = href.startsWith('http') ? href : appConfig.site + href
            const vidMatch = href.match(/v=(\d+)/)
            const vod_id = vidMatch ? vidMatch[1] : href

            // 检查是否已存在
            const exists = cards.some(card => card.vod_id === vod_id)
            if (!exists) {
                cards.push({
                    vod_id: vod_id,
                    vod_name: title,
                    vod_pic: cover,
                    vod_remarks: duration,
                    ext: {
                        url: fullUrl,
                    },
                })
            }
        }
    })

    // 解析移动端卡片
    $('.card-mobile-panel').each((_, element) => {
        const linkElem = $(element).find('.overlay')
        const href = linkElem.attr('href')
        const title = $(element).find('.card-mobile-title').text().trim()
        const cover = $(element).find('img').eq(1).attr('src')
        const duration = $(element).find('.card-mobile-duration').first().text().trim()

        if (href && title) {
            const fullUrl = href.startsWith('http') ? href : appConfig.site + href
            const vidMatch = href.match(/v=(\d+)/)
            const vod_id = vidMatch ? vidMatch[1] : href

            const exists = cards.some(card => card.vod_id === vod_id)
            if (!exists) {
                cards.push({
                    vod_id: vod_id,
                    vod_name: title,
                    vod_pic: cover,
                    vod_remarks: duration,
                    ext: {
                        url: fullUrl,
                    },
                })
            }
        }
    })

    return jsonify({
        list: cards,
    })
}

async function getTracks(ext) {
    ext = argsify(ext)
    let tracks = []
    let url = ext.url

    const { data } = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
            'Referer': appConfig.site,
        },
    })

    const $ = cheerio.load(data)

    // 提取所有视频源
    const sources = []
    $('video source').each((_, element) => {
        const src = $(element).attr('src')
        const size = $(element).attr('size')
        if (src) {
            sources.push({
                src: src,
                size: size || 'unknown'
            })
        }
    })

    // 按清晰度分组
    const qualityMap = {
        '1080': [],
        '720': [],
        '480': []
    }

    sources.forEach(source => {
        if (source.size === '1080' || source.src.indexOf('1080p') > -1) {
            qualityMap['1080'].push(source.src)
        } else if (source.size === '720' || source.src.indexOf('720p') > -1) {
            qualityMap['720'].push(source.src)
        } else if (source.size === '480' || source.src.indexOf('480p') > -1) {
            qualityMap['480'].push(source.src)
        }
    })

    // 创建播放线路
    const qualities = ['1080', '720', '480']
    qualities.forEach(quality => {
        if (qualityMap[quality].length > 0) {
            const episodes = qualityMap[quality].map((url, index) => ({
                name: '播放',
                pan: '',
                ext: {
                    url: url,
                },
            }))

            tracks.push({
                title: quality + 'p',
                tracks: episodes,
            })
        }
    })

    return jsonify({
        list: tracks,
    })
}

async function getPlayinfo(ext) {
    ext = argsify(ext)
    const url = ext.url

    $print('Hanime1 播放地址: ' + url)

    // 视频链接是直接的 MP4 地址，无需二次解析
    return jsonify({
        urls: [url],
        headers: [
            {
                'User-Agent': UA,
                'Referer': appConfig.site,
            }
        ]
    })
}

async function search(ext) {
    ext = argsify(ext)
    let cards = []
    let text = encodeURIComponent(ext.text)
    let page = ext.page || 1
    let url = `${appConfig.site}/search?query=${text}`

    if (page > 1) {
        url += `&page=${page}`
    }

    const { data } = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
            'Referer': appConfig.site,
        },
    })

    const $ = cheerio.load(data)

    // 解析搜索结果
    $('.horizontal-card').each((_, element) => {
        const linkElem = $(element).find('a.video-link')
        const href = linkElem.attr('href')
        const title = $(element).find('.title').text().trim()
        const cover = $(element).find('.main-thumb').attr('src')
        const duration = $(element).find('.duration').text().trim()

        if (href && title) {
            const fullUrl = href.startsWith('http') ? href : appConfig.site + href
            const vidMatch = href.match(/v=(\d+)/)
            const vod_id = vidMatch ? vidMatch[1] : href

            cards.push({
                vod_id: vod_id,
                vod_name: title,
                vod_pic: cover,
                vod_remarks: duration,
                ext: {
                    url: fullUrl,
                },
            })
        }
    })

    $('.video-item-container').each((_, element) => {
        const linkElem = $(element).find('a')
        const href = linkElem.attr('href')
        const title = $(element).find('.title').text().trim()
        const cover = $(element).find('.main-thumb').attr('src')
        const duration = $(element).find('.duration').text().trim()

        if (href && title) {
            const fullUrl = href.startsWith('http') ? href : appConfig.site + href
            const vidMatch = href.match(/v=(\d+)/)
            const vod_id = vidMatch ? vidMatch[1] : href

            const exists = cards.some(card => card.vod_id === vod_id)
            if (!exists) {
                cards.push({
                    vod_id: vod_id,
                    vod_name: title,
                    vod_pic: cover,
                    vod_remarks: duration,
                    ext: {
                        url: fullUrl,
                    },
                })
            }
        }
    })

    return jsonify({
        list: cards,
    })
}
