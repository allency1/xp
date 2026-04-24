const cheerio = createCheerio()

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

let appConfig = {
    ver: 1,
    title: 'GetAV',
    site: 'https://getav.net',
}

async function getConfig() {
    let config = appConfig
    config.tabs = await getTabs()
    return jsonify(config)
}

async function getTabs() {
    let list = [
        {
            name: '热门',
            ext: {
                url: appConfig.site + '/zh/hot',
            },
        },
        {
            name: '最新',
            ext: {
                url: appConfig.site + '/zh/latest',
            },
        },
        {
            name: '首页',
            ext: {
                url: appConfig.site + '/zh',
            },
        },
    ]
    return list
}

async function getCards(ext) {
    ext = argsify(ext)
    let cards = []
    let { page = 1, url } = ext

    if (!url) {
        url = appConfig.site + '/zh/hot'
    }

    const { data } = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
            'Accept': 'text/html',
            'Accept-Language': 'zh-CN,zh;q=0.9',
        },
    })

    // 从 HTML 中提取 Next.js 嵌入的视频数据
    // 查找 self.__next_f.push 中的数据
    const pushMatches = data.match(/self\.__next_f\.push\(\[.*?\]\)/g)

    if (pushMatches) {
        for (let pushStr of pushMatches) {
            // 提取 JSON 数据
            const jsonMatch = pushStr.match(/self\.__next_f\.push\((\[.*\])\)/)
            if (jsonMatch) {
                try {
                    const pushData = JSON.parse(jsonMatch[1])
                    if (pushData.length > 1) {
                        const content = pushData[1]
                        // 查找视频对象
                        if (typeof content === 'string' && content.includes('"id":') && content.includes('"title":')) {
                            // 提取所有视频 ID
                            const idMatches = content.match(/"id":"([^"]+)"/g)
                            const titleMatches = content.match(/"title":"([^"]+)"/g)
                            const imgMatches = content.match(/"localImg":"([^"]+)"/g)
                            const durationMatches = content.match(/"durationFormatted":"([^"]+)"/g)
                            const m3u8Matches = content.match(/"localM3u8Path":"([^"]+)"/g)
                            const previewMatches = content.match(/"previewVideoUrl":"([^"]+)"/g)

                            if (idMatches && titleMatches) {
                                const count = Math.min(idMatches.length, titleMatches.length)
                                for (let i = 0; i < count; i++) {
                                    const id = idMatches[i].match(/"id":"([^"]+)"/)[1]
                                    const title = titleMatches[i].match(/"title":"([^"]+)"/)[1]
                                    const img = imgMatches && imgMatches[i] ? imgMatches[i].match(/"localImg":"([^"]+)"/)[1] : ''
                                    const duration = durationMatches && durationMatches[i] ? durationMatches[i].match(/"durationFormatted":"([^"]+)"/)[1] : ''
                                    const m3u8 = m3u8Matches && m3u8Matches[i] ? m3u8Matches[i].match(/"localM3u8Path":"([^"]+)"/)[1] : ''
                                    const preview = previewMatches && previewMatches[i] ? previewMatches[i].match(/"previewVideoUrl":"([^"]+)"/)[1] : ''

                                    // 避免重复
                                    if (!cards.find(c => c.vod_id === id)) {
                                        cards.push({
                                            vod_id: id,
                                            vod_name: title,
                                            vod_pic: img ? appConfig.site + img : '',
                                            vod_remarks: duration,
                                            ext: {
                                                id: id,
                                                m3u8: m3u8,
                                                previewUrl: preview,
                                            },
                                        })
                                    }
                                }
                            }
                        }
                    }
                } catch (e) {
                    // 忽略解析错误
                }
            }
        }
    }

    return jsonify({ list: cards })
}

async function getTracks(ext) {
    ext = argsify(ext)
    let tracks = []
    const { id, m3u8, previewUrl } = ext

    if (!id) {
        return jsonify({
            list: [
                {
                    title: '默认线路',
                    tracks: [],
                },
            ],
        })
    }

    if (m3u8) {
        tracks.push({
            name: '播放',
            pan: '',
            ext: {
                url: appConfig.site + m3u8,
            },
        })
    }

    if (previewUrl) {
        tracks.push({
            name: '预览',
            pan: '',
            ext: {
                url: 'https://static.worldstatic.com' + previewUrl,
            },
        })
    }

    if (tracks.length === 0) {
        const detailUrl = appConfig.site + '/zh/videos/' + id.toLowerCase()

        const { data } = await $fetch.get(detailUrl, {
            headers: {
                'User-Agent': UA,
                'Accept': 'text/html',
            },
        })

        const m3u8Match = data.match(/"localM3u8Path":"([^"]+)"/)
        if (m3u8Match && m3u8Match[1]) {
            tracks.push({
                name: '播放',
                pan: '',
                ext: {
                    url: appConfig.site + m3u8Match[1],
                },
            })
        } else {
            const previewMatch = data.match(/"previewVideoUrl":"([^"]+)"/)
            if (previewMatch && previewMatch[1]) {
                tracks.push({
                    name: '预览',
                    pan: '',
                    ext: {
                        url: 'https://static.worldstatic.com' + previewMatch[1],
                    },
                })
            }
        }
    }

    return jsonify({
        list: [
            {
                title: 'GetAV',
                tracks: tracks,
            },
        ],
    })
}

async function getPlayinfo(ext) {
    ext = argsify(ext)
    const { url } = ext

    return jsonify({
        urls: url ? [url] : [],
        headers: [
            {
                'User-Agent': UA,
                'Referer': appConfig.site + '/',
            },
        ],
    })
}

async function search(ext) {
    ext = argsify(ext)
    const { text, wd, page = 1 } = ext
    const keyword = text || wd || ''

    if (!keyword) {
        return jsonify({ list: [], page, keyword })
    }

    const url = appConfig.site + '/zh/search?q=' + encodeURIComponent(keyword)

    let cards = []

    const { data } = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
            'Accept': 'text/html',
        },
    })

    // 从搜索结果页面提取视频数据
    const pushMatches = data.match(/self\.__next_f\.push\(\[.*?\]\)/g)

    if (pushMatches) {
        for (let pushStr of pushMatches) {
            const jsonMatch = pushStr.match(/self\.__next_f\.push\((\[.*\])\)/)
            if (jsonMatch) {
                try {
                    const pushData = JSON.parse(jsonMatch[1])
                    if (pushData.length > 1) {
                        const content = pushData[1]
                        if (typeof content === 'string' && content.includes('"id":') && content.includes('"title":')) {
                            const idMatches = content.match(/"id":"([^"]+)"/g)
                            const titleMatches = content.match(/"title":"([^"]+)"/g)
                            const imgMatches = content.match(/"localImg":"([^"]+)"/g)
                            const durationMatches = content.match(/"durationFormatted":"([^"]+)"/g)
                            const m3u8Matches = content.match(/"localM3u8Path":"([^"]+)"/g)
                            const previewMatches = content.match(/"previewVideoUrl":"([^"]+)"/g)

                            if (idMatches && titleMatches) {
                                const count = Math.min(idMatches.length, titleMatches.length)
                                for (let i = 0; i < count; i++) {
                                    const id = idMatches[i].match(/"id":"([^"]+)"/)[1]
                                    const title = titleMatches[i].match(/"title":"([^"]+)"/)[1]
                                    const img = imgMatches && imgMatches[i] ? imgMatches[i].match(/"localImg":"([^"]+)"/)[1] : ''
                                    const duration = durationMatches && durationMatches[i] ? durationMatches[i].match(/"durationFormatted":"([^"]+)"/)[1] : ''
                                    const m3u8 = m3u8Matches && m3u8Matches[i] ? m3u8Matches[i].match(/"localM3u8Path":"([^"]+)"/)[1] : ''
                                    const preview = previewMatches && previewMatches[i] ? previewMatches[i].match(/"previewVideoUrl":"([^"]+)"/)[1] : ''

                                    if (!cards.find(c => c.vod_id === id)) {
                                        cards.push({
                                            vod_id: id,
                                            vod_name: title,
                                            vod_pic: img ? appConfig.site + img : '',
                                            vod_remarks: duration,
                                            ext: {
                                                id: id,
                                                m3u8: m3u8,
                                                previewUrl: preview,
                                            },
                                        })
                                    }
                                }
                            }
                        }
                    }
                } catch (e) {
                    // 忽略解析错误
                }
            }
        }
    }

    return jsonify({ list: cards, page, keyword })
}
