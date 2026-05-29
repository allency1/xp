const cheerio = createCheerio()

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'

let appConfig = {
    ver: 1,
    title: 'JAVDAY',
    site: 'https://javday.app',
}

async function getConfig() {
    let config = appConfig
    config.tabs = [
        { name: '今日热门', ext: { url: appConfig.site }, ui: 1 },
        { name: '最新', ext: { url: appConfig.site + '/label/new/' }, ui: 1 },
        { name: '中文字幕', ext: { url: appConfig.site + '/label/chinese/' }, ui: 1 },
        { name: '无码', ext: { url: appConfig.site + '/label/uncensored/' }, ui: 1 },
    ]
    return jsonify(config)
}

async function getCards(ext) {
    ext = argsify(ext)
    let cards = []
    let page = ext.page || 1
    let url = ext.url || appConfig.site

    // 添加页码
    if (page > 1) {
        url = url + (url.includes('?') ? '&' : '?') + 'page=' + page
    }

    try {
        const { data } = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
                'Referer': appConfig.site + '/',
            },
            timeout: 15000,
        })

        const $ = cheerio.load(data)

        // 查找所有 videoBox
        $('a.videoBox').each((_, element) => {
            const $el = $(element)
            const href = $el.attr('href')

            if (!href || !href.includes('/videos/')) return

            // 提取视频ID
            const match = href.match(/\/videos\/([^\/\?]+)/)
            const vod_id = match ? match[1] : ''

            if (!vod_id) return

            // 标题
            const $title = $el.find('span.title')
            const title = $title.text().trim()

            // 封面 - 从 background-image 提取
            const $cover = $el.find('.videoBox-cover')
            let cover = ''
            if ($cover.length > 0) {
                const style = $cover.attr('style') || ''
                const urlMatch = style.match(/url\(([^)]+)\)/)
                if (urlMatch) {
                    cover = urlMatch[1].replace(/['"]/g, '')
                    // 如果是相对路径，补全
                    if (cover && !cover.startsWith('http')) {
                        cover = appConfig.site + cover
                    }
                }
            }

            // 播放次数
            const $views = $el.find('.views .number')
            const views = $views.text().trim()

            const fullUrl = href.startsWith('http') ? href : appConfig.site + href

            cards.push({
                vod_id: vod_id,
                vod_name: title,
                vod_pic: cover,
                vod_remarks: views ? views + ' 次' : '',
                ext: {
                    url: fullUrl,
                },
            })
        })

    } catch (e) {
        // 错误处理
    }

    return jsonify({ list: cards })
}

async function getTracks(ext) {
    ext = argsify(ext)
    const url = ext.url
    if (!url) return jsonify({ list: [{ title: '默认', tracks: [] }] })

    return jsonify({
        list: [{
            title: 'JAVDAY',
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

    if (typeof $print !== 'undefined') {
        $print('JAVDAY 播放解析: ' + url)
    }

    try {
        const { data } = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
                'Referer': url,
            },
            timeout: 15000,
        })

        if (typeof $print !== 'undefined') {
            $print('✓ 获取详情页成功')
        }

        const $ = cheerio.load(data)

        // 方法1: 查找 DPlayer 初始化脚本
        $('script').each((_, element) => {
            if (playurl) return

            const scriptContent = $(element).html() || ''

            if (scriptContent.includes('new DPlayer') || scriptContent.includes('DPlayer')) {
                // 提取 video.url
                const videoUrlMatch = scriptContent.match(/video\s*:\s*{\s*[^}]*url\s*:\s*['"]([^'"]+)['"]/)
                if (videoUrlMatch && videoUrlMatch[1]) {
                    playurl = videoUrlMatch[1]
                    if (typeof $print !== 'undefined') {
                        $print('✓ 从 DPlayer 找到: ' + playurl.substring(0, 80))
                    }
                    return
                }

                // 提取 url: 'xxx.m3u8'
                const urlMatch = scriptContent.match(/url\s*:\s*['"]([^'"]+\.m3u8[^'"]*)['"]/)
                if (urlMatch && urlMatch[1]) {
                    playurl = urlMatch[1]
                    if (typeof $print !== 'undefined') {
                        $print('✓ 从 DPlayer url 找到: ' + playurl.substring(0, 80))
                    }
                    return
                }
            }
        })

        // 方法2: 查找 video 标签的 src
        if (!playurl) {
            const videoSrc = $('#J_prismPlayer').attr('src') || $('video[src]').attr('src')
            if (videoSrc) {
                playurl = videoSrc
                if (typeof $print !== 'undefined') {
                    $print('✓ 从 video 标签找到: ' + playurl.substring(0, 80))
                }
            }
        }

        // 方法3: 查找 source 标签
        if (!playurl) {
            const sourceSrc = $('source[src*=".m3u8"]').attr('src') || $('video source').attr('src')
            if (sourceSrc) {
                playurl = sourceSrc
                if (typeof $print !== 'undefined') {
                    $print('✓ 从 source 标签找到: ' + playurl.substring(0, 80))
                }
            }
        }

        // 方法4: 在所有 script 中查找 .m3u8
        if (!playurl) {
            $('script').each((_, element) => {
                if (playurl) return

                const scriptContent = $(element).html() || ''
                if (scriptContent.includes('.m3u8')) {
                    const m3u8Match = scriptContent.match(/['"](https?:\/\/[^'"]+\.m3u8[^'"]*)['"]/i)
                    if (m3u8Match && m3u8Match[1]) {
                        playurl = m3u8Match[1]
                        if (typeof $print !== 'undefined') {
                            $print('✓ 从 script 找到: ' + playurl.substring(0, 80))
                        }
                        return
                    }
                }
            })
        }

        // 方法5: 查找 iframe
        if (!playurl) {
            const iframeSrc = $('iframe[src*="player"]').attr('src')
            if (iframeSrc) {
                playurl = iframeSrc
                if (typeof $print !== 'undefined') {
                    $print('✓ 从 iframe 找到: ' + playurl.substring(0, 80))
                }
            }
        }

        if (!playurl && typeof $print !== 'undefined') {
            $print('✗ 未找到播放地址')
        }

    } catch (e) {
        if (typeof $print !== 'undefined') {
            $print('✗ 请求失败: ' + e)
        }
    }

    if (typeof $print !== 'undefined') {
        $print('=== 最终播放地址 ===')
        $print(playurl || '(空)')
    }

    return jsonify({
        urls: [playurl],
        headers: {
            'User-Agent': UA,
            'Referer': 'https://javday.app/',
        },
    })
}

async function search(ext) {
    ext = argsify(ext)
    let cards = []
    const text = ext.text || ''
    const page = ext.page || 1

    if (!text) return jsonify({ list: [] })

    let url = `${appConfig.site}/search/${encodeURIComponent(text)}/`
    if (page > 1) {
        url += `?page=${page}`
    }

    try {
        const { data } = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
                'Referer': appConfig.site + '/',
            },
            timeout: 15000,
        })

        const $ = cheerio.load(data)

        // 使用相同的解析逻辑
        $('a.videoBox').each((_, element) => {
            const $el = $(element)
            const href = $el.attr('href')

            if (!href || !href.includes('/videos/')) return

            const match = href.match(/\/videos\/([^\/\?]+)/)
            const vod_id = match ? match[1] : ''

            if (!vod_id) return

            const $title = $el.find('span.title')
            const title = $title.text().trim()

            const $cover = $el.find('.videoBox-cover')
            let cover = ''
            if ($cover.length > 0) {
                const style = $cover.attr('style') || ''
                const urlMatch = style.match(/url\(([^)]+)\)/)
                if (urlMatch) {
                    cover = urlMatch[1].replace(/['"]/g, '')
                    if (cover && !cover.startsWith('http')) {
                        cover = appConfig.site + cover
                    }
                }
            }

            const fullUrl = href.startsWith('http') ? href : appConfig.site + href

            cards.push({
                vod_id: vod_id,
                vod_name: title,
                vod_pic: cover,
                vod_remarks: '',
                ext: {
                    url: fullUrl,
                },
            })
        })

    } catch (e) {
        // 错误处理
    }

    return jsonify({ list: cards })
}
