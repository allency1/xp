const cheerio = createCheerio()

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

let appConfig = {
    ver: 1,
    title: 'A123TV',
    site: 'https://a123tv.com',
}

async function getConfig() {
    let config = appConfig
    config.tabs = await getTabs()
    return jsonify(config)
}

async function getTabs() {
    let list = [
        {
            name: '首页',
            ext: {
                url: appConfig.site + '/',
            },
        },
        {
            name: '电影',
            ext: {
                url: appConfig.site + '/t/10.html',
            },
        },
        {
            name: '连续剧',
            ext: {
                url: appConfig.site + '/t/11.html',
            },
        },
        {
            name: '综艺',
            ext: {
                url: appConfig.site + '/t/12.html',
            },
        },
        {
            name: '动漫',
            ext: {
                url: appConfig.site + '/t/13.html',
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
        // A123TV 的分页格式
        if (!url.endsWith('.html')) {
            url = url.replace('.html', '') + 'page/' + page + '.html'
        } else {
            url = url.replace('.html', '/page/' + page + '.html')
        }
    }

    try {
        const { data } = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
            },
        })

        const $ = cheerio.load(data)

        // 解析影片卡片 - A123TV 结构
        // 每个影片在一个包含链接的区块中
        $('a[href^="/v/"]').each((_, element) => {
            const link = $(element)
            let href = link.attr('href')
            
            // 获取标题 - 从h3或其他标题标签
            let title = ''
            const titleElem = link.find('h3').first()
            if (titleElem.length > 0) {
                title = titleElem.text().trim()
            } else {
                // 尝试从链接文本或其他元素获取
                title = link.attr('title') || link.text().trim()
            }
            
            // 获取封面图
            let cover = ''
            const img = link.find('img').first()
            if (img.length > 0) {
                cover = img.attr('data-src') || img.attr('src') || ''
            }
            
            // 获取线路数量和其他信息
            let remarks = ''
            const lineElem = link.find('.line-count, [class*="线路"]').first()
            if (lineElem.length > 0) {
                remarks = lineElem.text().trim()
            }
            
            // 获取清晰度
            const qualityElem = link.find('.quality, [class*="1080p"], [class*="720p"]').first()
            if (qualityElem.length > 0) {
                const quality = qualityElem.text().trim()
                if (quality) {
                    remarks = quality + (remarks ? ' | ' + remarks : '')
                }
            }

            if (href && title && !title.includes('电影') && !title.includes('剧集')) {
                // 确保URL完整
                if (!href.startsWith('http')) {
                    href = appConfig.site + href
                }
                
                cards.push({
                    vod_id: href,
                    vod_name: title,
                    vod_pic: cover,
                    vod_remarks: remarks,
                    ext: {
                        url: href,
                    },
                })
            }
        })

        // 去重处理
        const seen = new Set()
        cards = cards.filter(card => {
            if (seen.has(card.vod_id)) {
                return false
            }
            seen.add(card.vod_id)
            return true
        })

    } catch (error) {
        $print('Error in getCards: ' + error)
    }

    return jsonify({
        list: cards,
    })
}

async function getTracks(ext) {
    ext = argsify(ext)
    let tracks = []
    let url = ext.url

    try {
        const { data } = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
            },
        })

        const $ = cheerio.load(data)
        
        const playGroups = []
        
        // 方法1：查找所有播放线路
        // A123TV 的线路在 .w4-line-item 或类似的元素中
        const episodes = []
        
        // 查找所有线路链接
        $('.w4-line-item, a[href*="/v/"][rel="nofollow"]').each((_, e) => {
            const link = $(e)
            let href = link.attr('href')
            let name = link.attr('title') || link.find('.w4-line-info .r').text().trim()
            
            // 如果name为空，尝试从其他元素获取
            if (!name) {
                name = link.find('h3.t').text().trim()
            }
            if (!name) {
                // 从链接中提取线路编号
                const match = href.match(/\/v\/[^/]+\/([^/]+)/)
                if (match) {
                    name = '线路'
                } else {
                    name = '播放'
                }
            }
            
            // 清理name
            name = name.replace(/\s+/g, ' ').trim()
            
            if (href && href.includes('/v/')) {
                // 确保URL完整
                if (!href.startsWith('http')) {
                    href = appConfig.site + href
                }
                
                // 避免重复
                const exists = episodes.find(ep => ep.ext.url === href)
                if (!exists) {
                    episodes.push({
                        name: name,
                        pan: '',
                        ext: {
                            url: href,
                        },
                    })
                }
            }
        })
        
        // 方法2：如果找到了剧集，按线路分组
        if (episodes.length > 0) {
            // 如果只有一个播放链接
            if (episodes.length === 1) {
                playGroups.push({
                    title: '默认线路',
                    tracks: episodes
                })
            } else {
                // 多个线路，每个线路一个组
                episodes.forEach((ep, index) => {
                    playGroups.push({
                        title: ep.name || '线路' + (index + 1),
                        tracks: [ep]
                    })
                })
            }
        }
        
        // 方法3：如果上面的方法没找到，尝试查找视频容器
        if (playGroups.length === 0) {
            const videoContainer = $('[id^="awp"], .w4-player, video')
            if (videoContainer.length > 0) {
                const src = videoContainer.attr('data-src') || videoContainer.attr('src')
                if (src) {
                    playGroups.push({
                        title: '默认线路',
                        tracks: [{
                            name: '立即播放',
                            pan: '',
                            ext: {
                                url: url,
                            },
                        }]
                    })
                }
            }
        }
        
        tracks = playGroups
        
    } catch (error) {
        $print('Error in getTracks: ' + error)
    }

    return jsonify({
        list: tracks,
    })
}

async function getPlayinfo(ext) {
    ext = argsify(ext)
    const url = ext.url
    let playurl = ''

    try {
        // 获取播放页
        const { data } = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
                'Referer': appConfig.site,
            },
        })

        // 方法1：从 data-src 属性提取 m3u8 链接
        const dataSrcMatch = data.match(/data-src=["'](https?:\/\/[^"']+\.m3u8[^"']*)["']/)
        if (dataSrcMatch) {
            playurl = dataSrcMatch[1]
            $print('✓ 从 data-src 提取 m3u8: ' + playurl)
        }
        
        // 方法2：查找页面中的 m3u8 链接
        if (!playurl) {
            const m3u8Match = data.match(/(https?:\/\/[^\s"'<>]+\.m3u8[^\s"'<>]*)/)
            if (m3u8Match) {
                playurl = m3u8Match[1]
                $print('✓ 从页面提取 m3u8: ' + playurl)
            }
        }
        
        // 方法3：查找视频播放器容器
        if (!playurl) {
            const playerMatch = data.match(/id=["']awp\d+["'][^>]*data-src=["']([^"]+)["']/)
            if (playerMatch) {
                playurl = playerMatch[1]
                if (!playurl.startsWith('http')) {
                    playurl = 'https:' + playurl
                }
                $print('✓ 从播放器容器提取: ' + playurl)
            }
        }
        
        if (!playurl) {
            $print('✗ 未能提取视频URL')
        }
        
    } catch (error) {
        $print('获取播放信息失败: ' + error)
    }

    return jsonify({
        urls: [playurl],
        headers: [
            {
                'User-Agent': UA,
                Referer: appConfig.site,
            },
        ],
    })
}

async function search(ext) {
    ext = argsify(ext)
    let cards = []
    let text = encodeURIComponent(ext.text)
    let page = ext.page || 1
    
    // A123TV 搜索URL格式
    let url = `${appConfig.site}/s/?wd=${text}`
    if (page > 1) {
        url += `&page=${page}`
    }

    try {
        const { data } = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
            },
        })

        const $ = cheerio.load(data)

        // 使用与 getCards 相同的解析逻辑
        $('a[href^="/v/"]').each((_, element) => {
            const link = $(element)
            let href = link.attr('href')
            
            // 获取标题
            let title = ''
            const titleElem = link.find('h3').first()
            if (titleElem.length > 0) {
                title = titleElem.text().trim()
            } else {
                title = link.attr('title') || link.text().trim()
            }
            
            // 获取封面图
            let cover = ''
            const img = link.find('img').first()
            if (img.length > 0) {
                cover = img.attr('data-src') || img.attr('src') || ''
            }
            
            // 获取线路数量和其他信息
            let remarks = ''
            const lineElem = link.find('.line-count, [class*="线路"]').first()
            if (lineElem.length > 0) {
                remarks = lineElem.text().trim()
            }

            if (href && title && !title.includes('电影') && !title.includes('剧集')) {
                if (!href.startsWith('http')) {
                    href = appConfig.site + href
                }
                
                cards.push({
                    vod_id: href,
                    vod_name: title,
                    vod_pic: cover,
                    vod_remarks: remarks,
                    ext: {
                        url: href,
                    },
                })
            }
        })

        // 去重
        const seen = new Set()
        cards = cards.filter(card => {
            if (seen.has(card.vod_id)) {
                return false
            }
            seen.add(card.vod_id)
            return true
        })

    } catch (error) {
        $print('Error in search: ' + error)
    }

    return jsonify({
        list: cards,
    })
}