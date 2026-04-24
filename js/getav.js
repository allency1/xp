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
                api: '/api/recommendations/trending',
            },
        },
        {
            name: '正在观看',
            ext: {
                api: '/api/recommendations/watching-now',
            },
        },
    ]
    return list
}

async function getCards(ext) {
    ext = argsify(ext)
    let cards = []
    let { page = 1, api } = ext

    if (!api) {
        api = '/api/recommendations/trending'
    }

    const url = appConfig.site + api + '?limit=40&locale=zh'

    $print('GetAV 获取列表: ' + url)

    let data
    try {
        const response = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
                'Accept': 'application/json',
                'Accept-Language': 'zh-CN,zh;q=0.9',
            },
        })

        // 解析 JSON 响应
        if (typeof response.data === 'string') {
            data = JSON.parse(response.data)
        } else {
            data = response.data
        }

        $print('API 返回: ' + (data.success ? '成功' : '失败') + ', 视频数: ' + (data.movies ? data.movies.length : 0))
    } catch (e) {
        $print('请求失败: ' + e)
        return jsonify({ list: cards })
    }

    if (!data || !data.success || !data.movies) {
        $print('无数据返回')
        return jsonify({ list: cards })
    }

    // 转换为 XPTV 格式
    for (let movie of data.movies) {
        cards.push({
            vod_id: movie.id,
            vod_name: movie.title,
            vod_pic: movie.localImg ? appConfig.site + movie.localImg : '',
            vod_remarks: movie.durationFormatted || '',
            ext: {
                id: movie.id,
                m3u8: movie.localM3u8Path,
                previewUrl: movie.previewVideoUrl,
            },
        })
    }

    $print('解析到 ' + cards.length + ' 个视频')
    return jsonify({ list: cards })
}

async function getTracks(ext) {
    ext = argsify(ext)
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

    $print('GetAV 获取播放源: ' + id)

    let tracks = []

    // 如果有 m3u8 地址，添加播放源
    if (m3u8) {
        tracks.push({
            name: '播放',
            pan: '',
            ext: {
                url: appConfig.site + m3u8,
                m3u8: m3u8,
            },
        })
    }

    // 如果有预览视频，添加预览源
    if (previewUrl) {
        tracks.push({
            name: '预览',
            pan: '',
            ext: {
                url: 'https://static.worldstatic.com' + previewUrl,
                preview: true,
            },
        })
    }

    // 如果都没有，尝试从详情页获取
    if (tracks.length === 0) {
        const detailUrl = appConfig.site + '/zh/videos/' + id.toLowerCase()
        $print('从详情页获取: ' + detailUrl)

        try {
            const response = await $fetch.get(detailUrl, {
                headers: {
                    'User-Agent': UA,
                    'Accept': 'text/html',
                },
            })

            const html = response.data

            // 从 HTML 中提取 m3u8 路径
            const m3u8Match = html.match(/"localM3u8Path"\s*:\s*"([^"]+)"/)
            if (m3u8Match && m3u8Match[1]) {
                tracks.push({
                    name: '播放',
                    pan: '',
                    ext: {
                        url: appConfig.site + m3u8Match[1],
                    },
                })
            } else {
                // 尝试预览视频
                const previewMatch = html.match(/"previewVideoUrl"\s*:\s*"([^"]+)"/)
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
        } catch (e) {
            $print('获取详情页失败: ' + e)
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
    try {
        ext = argsify(ext)
        const { url } = ext

        $print('GetAV 播放: ' + url)

        return jsonify({
            urls: url ? [url] : [],
            headers: [
                {
                    'User-Agent': UA,
                    'Referer': appConfig.site + '/',
                },
            ],
        })
    } catch (error) {
        $print('getPlayinfo error: ' + error)
        return jsonify({ urls: [] })
    }
}

async function search(ext) {
    ext = argsify(ext)
    const { text, wd, page = 1 } = ext
    const keyword = text || wd || ''

    if (!keyword) {
        return jsonify({ list: [], page, keyword })
    }

    const url = appConfig.site + '/api/search?q=' + encodeURIComponent(keyword) + '&limit=40&locale=zh'

    $print('GetAV 搜索: ' + keyword)

    let cards = []
    try {
        const response = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
                'Accept': 'application/json',
            },
        })

        let data
        if (typeof response.data === 'string') {
            data = JSON.parse(response.data)
        } else {
            data = response.data
        }

        if (data && data.success && data.movies) {
            for (let movie of data.movies) {
                cards.push({
                    vod_id: movie.id,
                    vod_name: movie.title,
                    vod_pic: movie.localImg ? appConfig.site + movie.localImg : '',
                    vod_remarks: movie.durationFormatted || '',
                    ext: {
                        id: movie.id,
                        m3u8: movie.localM3u8Path,
                        previewUrl: movie.previewVideoUrl,
                    },
                })
            }
        }

        $print('搜索到 ' + cards.length + ' 个结果')
    } catch (e) {
        $print('搜索失败: ' + e)
    }

    return jsonify({ list: cards, page, keyword })
}
