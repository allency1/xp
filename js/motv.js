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
        { name: '日本有码', ext: { url: appConfig.site + '/vodshow/20--------1---/', tid: '20' } },
        { name: '日本无码', ext: { url: appConfig.site + '/vodshow/50--------1---/', tid: '50' } },
        { name: '欧美风情', ext: { url: appConfig.site + '/vodshow/25--------1---/', tid: '25' } },
        { name: '国产原创', ext: { url: appConfig.site + '/vodshow/41--------1---/', tid: '41' } },
        { name: '动画',     ext: { url: appConfig.site + '/vodshow/29--------1---/', tid: '29' } },
        { name: '水果AV',   ext: { url: appConfig.site + '/vodshow/35--------1---/', tid: '35' } },
        { name: '色情情燴', ext: { url: appConfig.site + '/vodshow/30--------1---/', tid: '30' } },
        { name: '经典四级', ext: { url: appConfig.site + '/vodshow/47--------1---/', tid: '47' } },
        { name: '咸湿电台', ext: { url: appConfig.site + '/vodshow/169--------1---/', tid: '169' } },
    ]
    return list
}

async function getCards(ext) {
    ext = argsify(ext)
    let cards = []
    let page = ext.page || 1
    let tid = ext.tid || ''
    let url = ''

    if (tid) {
        url = appConfig.site + '/vodshow/' + tid + '--------' + page + '---/'
    } else {
        // 兼容旧格式
        url = ext.url || ''
    }

    $print('MOTV 获取列表: ' + url)

    let data
    try {
        const response = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
                'Referer': appConfig.site,
            },
            timeout: 15000,
        })
        data = response.data
        $print('✓ 成功获取页面')
    } catch (error) {
        $print('✗ 请求失败: ' + error)
        return jsonify({ list: [] })
    }

    const $ = cheerio.load(data)

    let skippedCount = 0
    let totalCount = 0

    // 解析视频列表项
    $('.movie-list-item').each((_, element) => {
        totalCount++
        const linkElem = $(element).find('a')
        const href = linkElem.attr('href')
        const dataUrl = linkElem.attr('data-url')

        // 只跳过明确需要登录的视频（有 data-url 或 show-login-modal 类）
        if (linkElem.hasClass('show-login-modal') || dataUrl) {
            skippedCount++
            return
        }

        // 跳过 javascript:; 链接（但没有 data-url 的可能是其他原因）
        if (!href || href === 'javascript:;') {
            skippedCount++
            return
        }

        const title = $(element).find('.movie-title').text().trim()
        const coverElem = $(element).find('.movie-post-lazyload')
        let cover = coverElem.attr('data-original')

        // 如果没有 data-original，尝试从 style 中提取
        if (!cover) {
            const style = coverElem.attr('style')
            if (style) {
                const match = style.match(/url\(['"]?([^'"]+)['"]?\)/)
                if (match) {
                    cover = match[1]
                }
            }
        }

        const rating = $(element).find('.movie-rating').text().trim()

        if (title) {
            const fullUrl = href.startsWith('http') ? href : appConfig.site + href

            // 提取视频ID - 支持 voddetail 和 vodplay
            let vod_id = ''
            const detailMatch = href.match(/\/voddetail\/(\d+)/)
            const playMatch = href.match(/\/vodplay\/(\d+)/)

            if (detailMatch) {
                vod_id = detailMatch[1]
            } else if (playMatch) {
                vod_id = playMatch[1]
            } else {
                vod_id = href
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

    $print('✓ 总共 ' + totalCount + ' 个视频，解析到 ' + cards.length + ' 个，跳过 ' + skippedCount + ' 个需要登录的')

    // 如果没有找到视频，尝试解析轮播图
    if (cards.length === 0) {
        $print('尝试解析轮播图...')
        $('.swiper-slide a').each((_, element) => {
            const href = $(element).attr('href')
            const img = $(element).find('img').attr('src')

            if (href && (href.indexOf('/voddetail/') > -1 || href.indexOf('/vodplay/') > -1)) {
                const detailMatch = href.match(/\/voddetail\/(\d+)/)
                const playMatch = href.match(/\/vodplay\/(\d+)/)

                if (detailMatch || playMatch) {
                    const fullUrl = href.startsWith('http') ? href : appConfig.site + href
                    const vod_id = detailMatch ? detailMatch[1] : playMatch[1]

                    cards.push({
                        vod_id: vod_id,
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
        $print('✓ 从轮播图解析到 ' + cards.length + ' 个视频')
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

    $print('MOTV 获取播放线路: ' + url)

    let data
    try {
        const response = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
                'Referer': appConfig.site,
            },
            timeout: 15000,
        })
        data = response.data
        $print('✓ 成功获取详情页')
    } catch (error) {
        $print('✗ 请求失败: ' + error)
        return jsonify({ list: [] })
    }

    const $ = cheerio.load(data)

    // 解析播放线路
    const playLines = []

    // 查找播放源标签（注意是下划线 play_source_tab）
    $('.play_source_tab .swiper-slide').each((index, element) => {
        const lineName = $(element).text().trim() || '播放源' + (index + 1)

        // 查找对应的播放列表（注意是下划线 play_list_box）
        const playListBox = $('.play_list_box').eq(index)
        const episodes = []

        // 播放链接在 ul.content_playlist li a 中
        playListBox.find('ul.content_playlist li a').each((_, e) => {
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
            $print('✓ 找到播放源: ' + lineName + ', 集数: ' + episodes.length)
        }
    })

    // 如果没有找到，尝试直接查找所有播放链接
    if (playLines.length === 0) {
        $print('尝试备用方案...')
        const episodes = []

        $('ul.content_playlist li a, .play_list_box a.btn').each((_, element) => {
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
                title: 'MOTVPlayer',
                tracks: episodes,
            })
            $print('✓ 备用方案找到 ' + episodes.length + ' 集')
        }
    }

    tracks = playLines

    if (tracks.length === 0) {
        $print('✗ 未找到播放线路')
    } else {
        $print('✓ 总共找到 ' + tracks.length + ' 个播放源')
    }

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
                // 播放页自身作为 Referer，CDN 校验需要
                'Referer': url,
            },
            timeout: 15000,
        })

        // 从 player_aaaa 变量中提取
        const playerMatch = data.match(/player_aaaa\s*=\s*(\{[\s\S]*?\})\s*<\/script>/)
        if (playerMatch) {
            try {
                const playerConfig = JSON.parse(playerMatch[1])
                let rawUrl = playerConfig.url || ''

                // encrypt=1 时 URL 是 base64 编码
                if (playerConfig.encrypt == 1 && rawUrl) {
                    rawUrl = atob(rawUrl)
                } else if (playerConfig.encrypt == 2 && rawUrl) {
                    // encrypt=2 是 URL encode
                    rawUrl = decodeURIComponent(rawUrl)
                }

                if (rawUrl) {
                    playurl = rawUrl
                    $print('✓ player_aaaa 解析成功: ' + playurl.substring(0, 80))
                }
            } catch (e) {
                $print('✗ player_aaaa JSON 解析失败: ' + e)
            }
        }

        // 兜底：直接搜索 m3u8/mp4
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
        headers: {
            'User-Agent': UA,
            // m3u8 请求时 Referer 必须是播放页，否则 CDN 返回错误
            'Referer': url,
            'Origin': appConfig.site,
        }
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

    $print('MOTV 搜索: ' + url)

    let data
    try {
        const response = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
                'Referer': appConfig.site,
            },
            timeout: 15000,
        })
        data = response.data
        $print('✓ 搜索成功')
    } catch (error) {
        $print('✗ 搜索失败: ' + error)
        return jsonify({ list: [] })
    }

    const $ = cheerio.load(data)

    let skippedCount = 0

    // 解析搜索结果
    $('.movie-list-item').each((_, element) => {
        const linkElem = $(element).find('a')
        const href = linkElem.attr('href')
        const dataUrl = linkElem.attr('data-url')

        // 跳过需要登录的视频
        if (linkElem.hasClass('show-login-modal') || dataUrl) {
            skippedCount++
            return
        }

        if (!href || href === 'javascript:;') {
            skippedCount++
            return
        }

        const title = $(element).find('.movie-title').text().trim()
        const coverElem = $(element).find('.movie-post-lazyload')
        let cover = coverElem.attr('data-original')

        if (!cover) {
            const style = coverElem.attr('style')
            if (style) {
                const match = style.match(/url\(['"]?([^'"]+)['"]?\)/)
                if (match) {
                    cover = match[1]
                }
            }
        }

        const rating = $(element).find('.movie-rating').text().trim()

        if (title) {
            const fullUrl = href.startsWith('http') ? href : appConfig.site + href

            let vod_id = ''
            const detailMatch = href.match(/\/voddetail\/(\d+)/)
            const playMatch = href.match(/\/vodplay\/(\d+)/)

            if (detailMatch) {
                vod_id = detailMatch[1]
            } else if (playMatch) {
                vod_id = playMatch[1]
            } else {
                vod_id = href
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

    $print('✓ 搜索到 ' + cards.length + ' 个结果，跳过 ' + skippedCount + ' 个需要登录的')

    return jsonify({
        list: cards,
    })
}
