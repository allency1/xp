const cheerio = createCheerio()

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

let appConfig = {
    ver: 1,
    title: 'MOTV',
    site: 'https://motv.app',
}

async function getConfig() {
    let config = appConfig
    config.tabs = await getTabs()
    return jsonify(config)
}

async function getTabs() {
    let list = [
        {
            name: '日本有码',
            ext: {
                url: appConfig.site + '/vodtype/20/',
            },
        },
        {
            name: '日本无码',
            ext: {
                url: appConfig.site + '/vodtype/50/',
            },
        },
        {
            name: '欧美风情',
            ext: {
                url: appConfig.site + '/vodtype/25/',
            },
        },
        {
            name: '国产原创',
            ext: {
                url: appConfig.site + '/vodtype/41/',
            },
        },
        {
            name: '动画',
            ext: {
                url: appConfig.site + '/vodtype/29/',
            },
        },
        {
            name: '水果AV',
            ext: {
                url: appConfig.site + '/vodtype/35/',
            },
        },
        {
            name: '色情情燴',
            ext: {
                url: appConfig.site + '/vodtype/30/',
            },
        },
        {
            name: '经典四级',
            ext: {
                url: appConfig.site + '/vodtype/47/',
            },
        },
        {
            name: '咸湿电台',
            ext: {
                url: appConfig.site + '/vodtype/169/',
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
        url = url.replace(/\/$/, '') + '/page/' + page + '/'
    }

    const { data } = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
            'Referer': appConfig.site,
        },
    })

    const $ = cheerio.load(data)

    // 解析视频列表项
    $('.movie-list-item').each((_, element) => {
        const linkElem = $(element).find('a')
        const href = linkElem.attr('href')

        // 跳过需要登录的视频
        if (!href || href === 'javascript:;' || linkElem.hasClass('show-login-modal')) {
            return
        }

        const title = $(element).find('.movie-title').text().trim()
        const coverElem = $(element).find('.movie-post-lazyload')
        const cover = coverElem.attr('data-original') || coverElem.css('background-image')?.replace(/url\(['"]?([^'"]+)['"]?\)/, '$1')
        const rating = $(element).find('.movie-rating').text().trim()

        if (href && title) {
            const fullUrl = href.startsWith('http') ? href : appConfig.site + href

            // 提取视频ID
            let vod_id = href
            const detailMatch = href.match(/\/voddetail\/(\d+)/)
            const playMatch = href.match(/\/vodplay\/(\d+)/)

            if (detailMatch) {
                vod_id = detailMatch[1]
            } else if (playMatch) {
                vod_id = playMatch[1]
            }

            cards.push({
                vod_id: vod_id,
                vod_name: title,
                vod_pic: cover,
                vod_remarks: rating,
                ext: {
                    url: fullUrl,
                },
            })
        }
    })

    // 如果没有找到视频，尝试解析轮播图
    if (cards.length === 0) {
        $('.swiper-slide a').each((_, element) => {
            const href = $(element).attr('href')
            const img = $(element).find('img').attr('src')

            if (href && href.indexOf('/vodplay/') > -1) {
                const playMatch = href.match(/\/vodplay\/(\d+)/)
                if (playMatch) {
                    const fullUrl = href.startsWith('http') ? href : appConfig.site + href
                    cards.push({
                        vod_id: playMatch[1],
                        vod_name: '推荐视频',
                        vod_pic: img,
                        vod_remarks: '',
                        ext: {
                            url: fullUrl,
                        },
                    })
                }
            }
        })
    }

    return jsonify({
        list: cards,
    })
}

async function getTracks(ext) {
    ext = argsify(ext)
    let tracks = []
    let url = ext.url

    // 如果是播放页面，转换为详情页
    if (url.indexOf('/vodplay/') > -1) {
        const match = url.match(/\/vodplay\/(\d+)/)
        if (match) {
            url = appConfig.site + '/voddetail/' + match[1] + '/'
        }
    }

    const { data } = await $fetch.get(url, {
        headers: {
            'User-Agent': UA,
            'Referer': appConfig.site,
        },
    })

    const $ = cheerio.load(data)

    // 解析播放线路
    const playLines = []

    // 方法1: 查找播放源标签和播放列表
    $('.play-source-tab').each((index, element) => {
        const lineName = $(element).text().trim() || '播放源' + (index + 1)

        const playListBox = $('.play-list-box').eq(index)
        const episodes = []

        playListBox.find('a').each((_, e) => {
            const name = $(e).text().trim()
            const href = $(e).attr('href')

            if (href && name && href !== 'javascript:;') {
                const fullUrl = href.startsWith('http') ? href : appConfig.site + href
                episodes.push({
                    name: name,
                    pan: '',
                    ext: {
                        url: fullUrl,
                    },
                })
            }
        })

        if (episodes.length > 0) {
            playLines.push({
                title: lineName,
                tracks: episodes,
            })
        }
    })

    // 方法2: 如果没有找到，尝试直接查找播放列表
    if (playLines.length === 0) {
        const episodes = []
        $('.play-list a, .stui-content__playlist a').each((_, element) => {
            const name = $(element).text().trim()
            const href = $(element).attr('href')

            if (href && name && href !== 'javascript:;') {
                const fullUrl = href.startsWith('http') ? href : appConfig.site + href
                episodes.push({
                    name: name,
                    pan: '',
                    ext: {
                        url: fullUrl,
                    },
                })
            }
        })

        if (episodes.length > 0) {
            playLines.push({
                title: '默认播放',
                tracks: episodes,
            })
        }
    }

    tracks = playLines

    return jsonify({
        list: tracks,
    })
}

async function getPlayinfo(ext) {
    ext = argsify(ext)
    const url = ext.url
    let playurl = ''

    $print('MOTV 播放解析: ' + url)

    try {
        const { data } = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
                'Referer': appConfig.site,
            },
        })

        const $ = cheerio.load(data)

        // 方法1: 查找 video source
        const videoSource = $('video source').attr('src')
        if (videoSource) {
            playurl = videoSource
            $print('✓ 找到 video source: ' + playurl)
        }

        // 方法2: 查找 iframe
        if (!playurl) {
            const iframeSrc = $('iframe').attr('src')
            if (iframeSrc) {
                playurl = iframeSrc
                $print('✓ 找到 iframe: ' + playurl)
            }
        }

        // 方法3: 从 script 中提取播放器配置
        if (!playurl) {
            const scriptMatch = data.match(/var\s+player_\w+\s*=\s*(\{[^}]+\})/)
            if (scriptMatch) {
                try {
                    const playerConfig = JSON.parse(scriptMatch[1])
                    playurl = playerConfig.url
                    $print('✓ 从 player 配置解析: ' + playurl)
                } catch (e) {
                    $print('✗ JSON 解析失败: ' + e)
                }
            }
        }

        // 方法4: 直接查找 m3u8/mp4 URL
        if (!playurl) {
            const m3u8Match = data.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/)
            const mp4Match = data.match(/(https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*)/)

            if (m3u8Match) {
                playurl = m3u8Match[1]
                $print('✓ 找到 m3u8: ' + playurl)
            } else if (mp4Match) {
                playurl = mp4Match[1]
                $print('✓ 找到 mp4: ' + playurl)
            }
        }

        if (!playurl) {
            $print('✗ 未找到播放地址')
        }

    } catch (error) {
        $print('✗ 请求失败: ' + error)
    }

    return jsonify({
        urls: [playurl],
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
    let url = `${appConfig.site}/vodsearch/-------------.html?wd=${text}`

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
    $('.movie-list-item').each((_, element) => {
        const linkElem = $(element).find('a')
        const href = linkElem.attr('href')

        // 跳过需要登录的视频
        if (!href || href === 'javascript:;' || linkElem.hasClass('show-login-modal')) {
            return
        }

        const title = $(element).find('.movie-title').text().trim()
        const coverElem = $(element).find('.movie-post-lazyload')
        const cover = coverElem.attr('data-original') || coverElem.css('background-image')?.replace(/url\(['"]?([^'"]+)['"]?\)/, '$1')
        const rating = $(element).find('.movie-rating').text().trim()

        if (href && title) {
            const fullUrl = href.startsWith('http') ? href : appConfig.site + href

            let vod_id = href
            const detailMatch = href.match(/\/voddetail\/(\d+)/)
            const playMatch = href.match(/\/vodplay\/(\d+)/)

            if (detailMatch) {
                vod_id = detailMatch[1]
            } else if (playMatch) {
                vod_id = playMatch[1]
            }

            cards.push({
                vod_id: vod_id,
                vod_name: title,
                vod_pic: cover,
                vod_remarks: rating,
                ext: {
                    url: fullUrl,
                },
            })
        }
    })

    return jsonify({
        list: cards,
    })
}
