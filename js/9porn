const cheerio = createCheerio()

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

let appConfig = {
    ver: 1,
    title: '91Porn',
    site: 'https://www.91porn.com',
    tabs: [
        { name: '首页',          ext: { url: 'https://www.91porn.com/index.php', type: 'index' } },
        { name: '91原创',        ext: { url: 'https://www.91porn.com/v.php?category=ori&viewtype=basic', type: 'v' } },
        { name: '当前热门',      ext: { url: 'https://www.91porn.com/v.php?category=hot&viewtype=basic', type: 'v' } },
        { name: '本月最热',      ext: { url: 'https://www.91porn.com/v.php?category=top&viewtype=basic', type: 'v' } },
        { name: '每月最热',      ext: { url: 'https://www.91porn.com/v.php?category=top&m=-1&viewtype=basic', type: 'v' } },
        { name: '精彩视频',      ext: { url: 'https://www.91porn.com/v.php?category=rf&viewtype=basic', type: 'v' } },
        { name: '高清视频',      ext: { url: 'https://www.91porn.com/v.php?category=hd&viewtype=basic', type: 'v' } },
        { name: '10分钟以上',    ext: { url: 'https://www.91porn.com/v.php?category=long&viewtype=basic', type: 'v' } },
        { name: '20分钟以上',    ext: { url: 'https://www.91porn.com/v.php?category=longer&viewtype=basic', type: 'v' } },
        { name: '多人收藏',      ext: { url: 'https://www.91porn.com/v.php?category=tf&viewtype=basic', type: 'v' } },
        { name: '收藏更多',      ext: { url: 'https://www.91porn.com/v.php?category=mf&viewtype=basic', type: 'v' } },
        { name: '中等热门',      ext: { url: 'https://www.91porn.com/v.php?category=md&viewtype=basic', type: 'v' } },
    ],
}

async function getConfig() {
    return jsonify(appConfig)
}

async function getCards(ext) {
    ext = argsify(ext)
    let cards = []
    let page = ext.page || 1
    let url = ext.url
    let type = ext.type || 'v'

    // 拼接页码
    if (page > 1) {
        if (type === 'index') {
            // 首页翻页格式：index.php?page=N
            url = url.includes('?') ? url + '&page=' + page : url + '?page=' + page
        } else {
            // 分类页翻页：&page=N
            url = url + '&page=' + page
        }
    }

    let data
    try {
        const response = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
                'Referer': appConfig.site + '/',
            },
            timeout: 15000,
        })
        data = response.data
    } catch (e) {
        return jsonify({ list: [] })
    }

    const $ = cheerio.load(data)

    // 解析视频卡片：.well.well-sm.videos-text-align
    $('.well.well-sm.videos-text-align').each((_, el) => {
        const $el = $(el)

        // 视频链接和 viewkey
        const $link = $el.find('a[href*="viewkey="]').first()
        const href = $link.attr('href')
        if (!href) return

        // 标题
        const title = $el.find('.video-title').text().trim()
        if (!title) return

        // 封面
        const cover = $el.find('img.img-responsive').attr('src') || ''

        // 时长
        const duration = $el.find('.duration').text().trim()

        // 提取额外信息：作者、热度
        const infoText = $el.text()
        let author = ''
        let views = ''
        const authorMatch = infoText.match(/作者:\s*([^\n\r]+?)(?:\s+热度|\s+收藏|$)/)
        if (authorMatch) author = authorMatch[1].trim().substring(0, 15)
        const viewsMatch = infoText.match(/热度:\s*(\d+)/)
        if (viewsMatch) views = viewsMatch[1] + '热度'

        const remarks = [duration, views].filter(s => s).join(' | ')

        cards.push({
            vod_id: href,
            vod_name: title,
            vod_pic: cover,
            vod_remarks: remarks,
            ext: {
                url: href.startsWith('http') ? href : appConfig.site + '/' + href,
            },
        })
    })

    return jsonify({ list: cards })
}

async function getTracks(ext) {
    ext = argsify(ext)
    const url = ext.url
    if (!url) return jsonify({ list: [{ title: '默认', tracks: [] }] })

    return jsonify({
        list: [{
            title: '91Porn',
            tracks: [{
                name: '播放',
                pan: '',
                ext: { url: url },
            }],
        }],
    })
}

async function getPlayinfo(ext) {
    ext = argsify(ext)
    const url = ext.url
    let playurl = ''

    try {
        const { data } = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
                'Referer': appConfig.site + '/',
            },
            timeout: 15000,
        })

        // 91Porn 视频源在 strencode2("...") 中，本质是 URL 编码
        // 解码后是 <source src='https://xxx.mp4' type='video/mp4'>
        const strencodeMatch = data.match(/strencode2\("([^"]+)"\)/)
        if (strencodeMatch && strencodeMatch[1]) {
            const decoded = decodeURIComponent(strencodeMatch[1])
            // 从 source 标签中提取 src
            const srcMatch = decoded.match(/<source[^>]+src=['"]([^'"]+)['"]/)
            if (srcMatch && srcMatch[1]) {
                playurl = srcMatch[1].replace(/&amp;/g, '&')
            }
        }

        // 兜底：直接在 HTML 中找 source 标签
        if (!playurl) {
            const sourceMatch = data.match(/<source[^>]+src=['"]([^'"]+\.mp4[^'"]*)['"]/)
            if (sourceMatch && sourceMatch[1]) {
                playurl = sourceMatch[1].replace(/&amp;/g, '&')
            }
        }

        // 兜底：直接搜索 mp4 URL（排除广告）
        if (!playurl) {
            const mp4Matches = data.match(/https?:\/\/[^\s"'<>]+\.mp4[^\s"'<>]*/g)
            if (mp4Matches) {
                // 过滤掉广告域名（如 kwai.net）
                for (const u of mp4Matches) {
                    if (!u.includes('kwai.net') && !u.includes('juicyads') && !u.includes('adserver')) {
                        playurl = u.replace(/&amp;/g, '&')
                        break
                    }
                }
            }
        }

    } catch (e) {
        // 请求失败
    }

    return jsonify({
        urls: [playurl],
        headers: {
            'User-Agent': UA,
            'Referer': appConfig.site + '/',
        },
    })
}

async function search(ext) {
    ext = argsify(ext)
    let cards = []
    const keyword = ext.text || ''
    const page = ext.page || 1

    if (!keyword) return jsonify({ list: [] })

    let url = `${appConfig.site}/search_result.php?search_id=${encodeURIComponent(keyword)}`
    if (page > 1) url += '&page=' + page

    let data
    try {
        const response = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
                'Referer': appConfig.site + '/',
            },
            timeout: 15000,
        })
        data = response.data
    } catch (e) {
        return jsonify({ list: [] })
    }

    const $ = cheerio.load(data)

    $('.well.well-sm.videos-text-align').each((_, el) => {
        const $el = $(el)
        const $link = $el.find('a[href*="viewkey="]').first()
        const href = $link.attr('href')
        if (!href) return

        const title = $el.find('.video-title').text().trim()
        if (!title) return

        const cover = $el.find('img.img-responsive').attr('src') || ''
        const duration = $el.find('.duration').text().trim()

        cards.push({
            vod_id: href,
            vod_name: title,
            vod_pic: cover,
            vod_remarks: duration,
            ext: {
                url: href.startsWith('http') ? href : appConfig.site + '/' + href,
            },
        })
    })

    return jsonify({ list: cards })
}
