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
        // 电影分类
        {
            name: '🎬 电影-全部',
            ext: {
                url: appConfig.site + '/t/10.html',
            },
        },
        {
            name: '🎬 电影-动作',
            ext: {
                url: appConfig.site + '/t/1001.html',
            },
        },
        {
            name: '🎬 电影-喜剧',
            ext: {
                url: appConfig.site + '/t/1002.html',
            },
        },
        {
            name: '🎬 电影-爱情',
            ext: {
                url: appConfig.site + '/t/1003.html',
            },
        },
        {
            name: '🎬 电影-科幻',
            ext: {
                url: appConfig.site + '/t/1004.html',
            },
        },
        {
            name: '🎬 电影-恐怖',
            ext: {
                url: appConfig.site + '/t/1005.html',
            },
        },
        {
            name: '🎬 电影-剧情',
            ext: {
                url: appConfig.site + '/t/1006.html',
            },
        },
        {
            name: '🎬 电影-战争',
            ext: {
                url: appConfig.site + '/t/1007.html',
            },
        },
        {
            name: '🎬 电影-纪录片',
            ext: {
                url: appConfig.site + '/t/1008.html',
            },
        },
        {
            name: '🎬 电影-奇幻',
            ext: {
                url: appConfig.site + '/t/1011.html',
            },
        },
        {
            name: '🎬 电影-动画',
            ext: {
                url: appConfig.site + '/t/1013.html',
            },
        },
        {
            name: '🎬 电影-犯罪',
            ext: {
                url: appConfig.site + '/t/1014.html',
            },
        },
        {
            name: '🎬 电影-悬疑',
            ext: {
                url: appConfig.site + '/t/1016.html',
            },
        },
        {
            name: '🎬 电影-4K',
            ext: {
                url: appConfig.site + '/t/1027.html',
            },
        },
        // 连续剧分类
        {
            name: '📺 连续剧-全部',
            ext: {
                url: appConfig.site + '/t/11.html',
            },
        },
        {
            name: '📺 连续剧-国产',
            ext: {
                url: appConfig.site + '/t/1101.html',
            },
        },
        {
            name: '📺 连续剧-香港',
            ext: {
                url: appConfig.site + '/t/1102.html',
            },
        },
        {
            name: '📺 连续剧-台湾',
            ext: {
                url: appConfig.site + '/t/1105.html',
            },
        },
        {
            name: '📺 连续剧-韩国',
            ext: {
                url: appConfig.site + '/t/1103.html',
            },
        },
        {
            name: '📺 连续剧-欧美',
            ext: {
                url: appConfig.site + '/t/1104.html',
            },
        },
        {
            name: '📺 连续剧-日本',
            ext: {
                url: appConfig.site + '/t/1106.html',
            },
        },
        {
            name: '📺 连续剧-泰国',
            ext: {
                url: appConfig.site + '/t/1108.html',
            },
        },
        // 综艺分类
        {
            name: '🎭 综艺-全部',
            ext: {
                url: appConfig.site + '/t/12.html',
            },
        },
        {
            name: '🎭 综艺-内地',
            ext: {
                url: appConfig.site + '/t/1201.html',
            },
        },
        {
            name: '🎭 综艺-港台',
            ext: {
                url: appConfig.site + '/t/1202.html',
            },
        },
        {
            name: '🎭 综艺-日韩',
            ext: {
                url: appConfig.site + '/t/1203.html',
            },
        },
        {
            name: '🎭 综艺-欧美',
            ext: {
                url: appConfig.site + '/t/1204.html',
            },
        },
        // 动漫分类
        {
            name: '👾 动漫-全部',
            ext: {
                url: appConfig.site + '/t/13.html',
            },
        },
        {
            name: '👾 动漫-国产',
            ext: {
                url: appConfig.site + '/t/1301.html',
            },
        },
        {
            name: '👾 动漫-日韩',
            ext: {
                url: appConfig.site + '/t/1302.html',
            },
        },
        {
            name: '👾 动漫-欧美',
            ext: {
                url: appConfig.site + '/t/1303.html',
            },
        },
        // 福利分类
        {
            name: '🔞 福利-全部',
            ext: {
                url: appConfig.site + '/t/15.html',
            },
        },
        {
            name: '🔞 福利-韩国',
            ext: {
                url: appConfig.site + '/t/1551.html',
            },
        },
        {
            name: '🔞 福利-日本',
            ext: {
                url: appConfig.site + '/t/1552.html',
            },
        },
        {
            name: '🔞 福利-大陆',
            ext: {
                url: appConfig.site + '/t/1555.html',
            },
        },
        {
            name: '🔞 福利-香港',
            ext: {
                url: appConfig.site + '/t/1553.html',
            },
        },
        {
            name: '🔞 福利-台湾',
            ext: {
                url: appConfig.site + '/t/1554.html',
            },
        },
        {
            name: '🔞 福利-欧美',
            ext: {
                url: appConfig.site + '/t/1556.html',
            },
        },
    ]
    return list
}

async function getCards(ext) {
    ext = argsify(ext)
    let cards = []
    let { page = 1, url } = ext

    // 修复分页逻辑 - A123TV 的分页格式是 /t/10/p2.html
    if (page > 1 && url) {
        if (url.endsWith('.html')) {
            // 移除 .html 结尾
            url = url.slice(0, -5)
        }
        // 检查是否已经有 /p 分页
        if (url.includes('/p')) {
            url = url.replace(/\/p\d+$/, '') + '/p' + page + '.html'
        } else {
            url = url + '/p' + page + '.html'
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
        // 每个影片在 .w4-item-wrap 中
        $('.w4-item-wrap').each((_, element) => {
            const item = $(element)
            
            // 获取链接
            const linkElem = item.find('a[href^="/v/"]').first()
            let href = linkElem.attr('href')
            
            if (!href) return // 跳过没有链接的项目
            
            // 获取标题 - 从 .w4-item-info .t 获取
            let title = ''
            const titleElem = item.find('.w4-item-info .t').first()
            if (titleElem.length > 0) {
                title = titleElem.attr('title') || titleElem.text().trim()
            }
            
            // 如果还没找到，尝试从img alt获取
            if (!title) {
                const img = item.find('img').first()
                title = img.attr('alt') || ''
            }
            
            // 获取封面图 - 从 figure img 获取
            let cover = ''
            const figureImg = item.find('figure img').first()
            if (figureImg.length > 0) {
                cover = figureImg.attr('data-src') || figureImg.attr('src') || ''
            }
            
            // 如果没找到，再尝试其他img
            if (!cover) {
                const img = item.find('img').first()
                cover = img.attr('data-src') || img.attr('src') || ''
            }
            
            // 确保封面URL完整
            if (cover && cover.startsWith('//')) {
                cover = 'https:' + cover
            }
            
            // 获取线路数量
            let lineCount = ''
            const lineElem = item.find('.s span').first()
            if (lineElem.length > 0) {
                lineCount = lineElem.text().trim()
            }
            
            // 获取清晰度
            let quality = ''
            const qualityElem = item.find('figure .r').first()
            if (qualityElem.length > 0) {
                quality = qualityElem.text().trim()
            }
            
            // 获取类型和年份
            let typeYear = ''
            const infoElem = item.find('.w4-item-info .i').first()
            if (infoElem.length > 0) {
                typeYear = infoElem.text().trim()
            }
            
            // 组合备注信息
            let remarks = ''
            if (quality) remarks += quality
            if (lineCount) remarks += (remarks ? ' | ' : '') + lineCount
            if (typeYear) remarks += (remarks ? ' | ' : '') + typeYear

            if (href && title && title.length > 1) {
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
        
        // 查找所有播放线路
        const episodes = []
        
        // 查找所有线路链接 - 在 .w4-line-item 中
        $('.w4-line-item').each((_, e) => {
            const link = $(e)
            let href = link.attr('href')
            
            // 获取线路名称
            let name = link.attr('title') || ''
            if (!name) {
                // 从 .w4-line-info .r 获取线路名
                name = link.find('.w4-line-info .r').text().trim()
            }
            if (!name) {
                // 从 h3.t 获取
                name = link.find('h3.t').text().trim()
            }
            if (!name) {
                name = '线路'
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
        
        // 如果找到了剧集
        if (episodes.length > 0) {
            playGroups.push({
                title: '播放线路',
                tracks: episodes
            })
        }
        
        // 如果没找到，尝试直接查找播放链接
        if (playGroups.length === 0) {
            $('a[href*="/v/"][rel="nofollow"]').each((_, e) => {
                const link = $(e)
                let href = link.attr('href')
                let name = link.attr('title') || link.text().trim() || '播放'
                
                if (href) {
                    if (!href.startsWith('http')) {
                        href = appConfig.site + href
                    }
                    
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
            
            if (episodes.length > 0) {
                playGroups.push({
                    title: '默认线路',
                    tracks: episodes
                })
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
                if (playurl && !playurl.startsWith('http')) {
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
        url = url.replace('/s/', '/s/p' + page + '/') + '.html'
    }

    try {
        const { data } = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
            },
        })

        const $ = cheerio.load(data)

        // 使用与 getCards 相同的解析逻辑
        $('.w4-item-wrap').each((_, element) => {
            const item = $(element)
            
            // 获取链接
            const linkElem = item.find('a[href^="/v/"]').first()
            let href = linkElem.attr('href')
            
            if (!href) return
            
            // 获取标题
            let title = ''
            const titleElem = item.find('.w4-item-info .t').first()
            if (titleElem.length > 0) {
                title = titleElem.attr('title') || titleElem.text().trim()
            }
            if (!title) {
                const img = item.find('img').first()
                title = img.attr('alt') || ''
            }
            
            // 获取封面图
            let cover = ''
            const figureImg = item.find('figure img').first()
            if (figureImg.length > 0) {
                cover = figureImg.attr('data-src') || figureImg.attr('src') || ''
            }
            if (!cover) {
                const img = item.find('img').first()
                cover = img.attr('data-src') || img.attr('src') || ''
            }
            if (cover && cover.startsWith('//')) {
                cover = 'https:' + cover
            }
            
            // 获取线路数量
            let lineCount = ''
            const lineElem = item.find('.s span').first()
            if (lineElem.length > 0) {
                lineCount = lineElem.text().trim()
            }
            
            // 获取清晰度
            let quality = ''
            const qualityElem = item.find('figure .r').first()
            if (qualityElem.length > 0) {
                quality = qualityElem.text().trim()
            }
            
            // 获取类型和年份
            let typeYear = ''
            const infoElem = item.find('.w4-item-info .i').first()
            if (infoElem.length > 0) {
                typeYear = infoElem.text().trim()
            }
            
            // 组合备注信息
            let remarks = ''
            if (quality) remarks += quality
            if (lineCount) remarks += (remarks ? ' | ' : '') + lineCount
            if (typeYear) remarks += (remarks ? ' | ' : '') + typeYear

            if (href && title && title.length > 1) {
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
