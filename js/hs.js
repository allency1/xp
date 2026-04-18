const cheerio = createCheerio()

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

let appConfig = {
    ver: 1,
    title: 'Hstream',
    site: 'https://hstream.moe',
    tabs: [
        { name: '最新上传', ext: { url: '/search?order=recently-uploaded' } },
        { name: '最新发布', ext: { url: '/search?order=recently-released' } },
        { name: '最多观看', ext: { url: '/search?order=view-count' } },
        { name: '4K 48fps', ext: { url: '/search?order=recently-uploaded&tags[0]=4k-48fps' } },
        { name: '无码',     ext: { url: '/search?order=recently-uploaded&tags[0]=uncensored' } },
        { name: '巨乳',     ext: { url: '/search?order=recently-uploaded&tags[0]=big-boobs' } },
        { name: '女仆',     ext: { url: '/search?order=recently-uploaded&tags[0]=maid' } },
        { name: '熟女',     ext: { url: '/search?order=recently-uploaded&tags[0]=milf' } },
        { name: '学生',     ext: { url: '/search?order=recently-uploaded&tags[0]=school-girl' } },
        { name: '触手',     ext: { url: '/search?order=recently-uploaded&tags[0]=tentacle' } },
        { name: '精灵',     ext: { url: '/search?order=recently-uploaded&tags[0]=elf' } },
        { name: 'BDSM',     ext: { url: '/search?order=recently-uploaded&tags[0]=bdsm' } },
    ],
}

async function getConfig(ext) {
    if (ext) {
        try {
            const cfg = argsify(ext)
            if (cfg.site) appConfig.site = cfg.site.replace(/\/$/, '')
        } catch (e) {}
    }
    return jsonify(appConfig)
}

function absUrl(u) {
    if (!u) return ''
    if (u.startsWith('http')) return u
    if (u.startsWith('//')) return 'https:' + u
    if (u.startsWith('/')) return appConfig.site + u
    return u
}

function parseList(html) {
    const $ = cheerio.load(html)
    const cards = []
    const seen = {}

    $('a[href*="/hentai/"]').each((_, el) => {
        const $a = $(el)
        const href = $a.attr('href') || ''
        const m = href.match(/\/hentai\/([a-z0-9-]+)$/i)
        if (!m) return
        const slug = m[1]
        if (seen[slug]) return

        const img = $a.find('img').first()
        const alt = (img.attr('alt') || '').trim()
        if (!alt) return
        const src = img.attr('src') || img.attr('data-src') || ''

        seen[slug] = true
        cards.push({
            vod_id: slug,
            vod_name: alt,
            vod_pic: absUrl(src),
            vod_remarks: '',
            ext: { slug: slug, url: absUrl(href) },
        })
    })

    return cards
}

async function getCards(ext) {
    ext = argsify(ext)
    const page = ext.page || 1
    const base = ext.url || '/search?order=recently-uploaded'
    const sep = base.includes('?') ? '&' : '?'
    const url = appConfig.site + base + sep + 'page=' + page

    $print('Hstream 列表: ' + url)

    let data
    try {
        const resp = await $fetch.get(url, {
            headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
            timeout: 20000,
        })
        data = resp.data
    } catch (e) {
        $print('请求失败: ' + e)
        return jsonify({ list: [] })
    }

    const cards = parseList(data)
    $print('✓ 解析到 ' + cards.length + ' 个视频')
    return jsonify({ list: cards })
}

async function getTracks(ext) {
    ext = argsify(ext)
    const url = ext.url || (ext.slug ? `${appConfig.site}/hentai/${ext.slug}` : '')
    if (!url) return jsonify({ list: [{ title: 'Hstream', tracks: [] }] })

    return jsonify({
        list: [{
            title: 'Hstream',
            tracks: [{
                name: '720p',
                pan: '',
                ext: { url: url, quality: '720p' },
            }, {
                name: '1080p',
                pan: '',
                ext: { url: url, quality: '1080p' },
            }, {
                name: '4K (若有)',
                pan: '',
                ext: { url: url, quality: '2160p' },
            }],
        }],
    })
}

function parseCookies(setCookieHeader) {
    // 兼容 Set-Cookie 为字符串或数组
    const arr = Array.isArray(setCookieHeader) ? setCookieHeader : (setCookieHeader ? [setCookieHeader] : [])
    const jar = {}
    arr.forEach(line => {
        if (!line) return
        line.split(/,(?=[^;]+=)/).forEach(part => {
            const kv = part.trim().split(';')[0]
            const eq = kv.indexOf('=')
            if (eq > 0) {
                const k = kv.slice(0, eq).trim()
                const v = kv.slice(eq + 1).trim()
                if (k && v) jar[k] = v
            }
        })
    })
    return jar
}

function cookieHeader(jar) {
    return Object.keys(jar).map(k => k + '=' + jar[k]).join('; ')
}

async function getPlayinfo(ext) {
    ext = argsify(ext)
    const pageUrl = ext.url
    const quality = ext.quality || '720p'

    $print('Hstream 播放解析: ' + pageUrl)

    let playurl = ''
    let subtitleUrl = ''

    try {
        // 1) 抓详情页，取 e_id、CSRF _token、session cookie
        const pageResp = await $fetch.get(pageUrl, {
            headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
            timeout: 20000,
        })
        const html = pageResp.data
        const jar = parseCookies(pageResp.headers && (pageResp.headers['set-cookie'] || pageResp.headers['Set-Cookie']))

        const eidMatch = html.match(/id="e_id"[^>]*value="(\d+)"/)
        const tokenMatch = html.match(/name="_token"[^>]*value="([^"]+)"/) || html.match(/_token"\s*value="([^"]+)"/)
        if (!eidMatch) {
            $print('✗ 未找到 e_id')
            return jsonify({ urls: [''], headers: { 'User-Agent': UA, 'Referer': appConfig.site + '/' } })
        }
        const episodeId = eidMatch[1]
        const csrfToken = tokenMatch ? tokenMatch[1] : ''

        // 2) 调用 /player/api 拿 stream_url 和 stream_domains
        const apiHeaders = {
            'User-Agent': UA,
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'Referer': pageUrl,
            'Origin': appConfig.site,
        }
        if (csrfToken) apiHeaders['X-CSRF-TOKEN'] = csrfToken
        if (jar['XSRF-TOKEN']) apiHeaders['X-XSRF-TOKEN'] = decodeURIComponent(jar['XSRF-TOKEN'])
        const cookieStr = cookieHeader(jar)
        if (cookieStr) apiHeaders['Cookie'] = cookieStr

        const apiResp = await $fetch.post(appConfig.site + '/player/api', JSON.stringify({ episode_id: parseInt(episodeId, 10) }), {
            headers: apiHeaders,
            timeout: 20000,
        })
        let apiData = apiResp.data
        if (typeof apiData === 'string') {
            try { apiData = JSON.parse(apiData) } catch (e) {}
        }
        if (!apiData || !apiData.stream_url || !apiData.stream_domains || !apiData.stream_domains.length) {
            $print('✗ /player/api 返回异常: ' + JSON.stringify(apiData).slice(0, 200))
            return jsonify({ urls: [''], headers: { 'User-Agent': UA, 'Referer': appConfig.site + '/' } })
        }

        // 3) 拼播放 URL。可用画质：x264.720p.mp4 / av1.1080p.mp4 / av1.2160p.mp4（部分片源）
        const domain = apiData.stream_domains[0]
        const streamPath = apiData.stream_url.replace(/^\/+|\/+$/g, '')
        let fileName = 'x264.720p.mp4'
        if (quality === '1080p') fileName = 'av1.1080p.mp4'
        else if (quality === '2160p') fileName = 'av1.2160p.mp4'

        playurl = `${domain}/${streamPath}/${fileName}`
        subtitleUrl = `${domain}/${streamPath}/eng.vtt`

        $print('✓ 播放地址: ' + playurl)
    } catch (e) {
        $print('✗ 解析失败: ' + e)
    }

    return jsonify({
        urls: [playurl],
        headers: {
            'User-Agent': UA,
            'Referer': appConfig.site + '/',
        },
        subtitles: subtitleUrl ? [{
            url: subtitleUrl,
            name: 'English',
            lang: 'en',
            format: 'text/vtt',
        }] : [],
    })
}

async function search(ext) {
    ext = argsify(ext)
    const text = encodeURIComponent((ext.text || '').trim())
    const page = ext.page || 1
    const url = `${appConfig.site}/search?s=${text}&page=${page}`

    $print('Hstream 搜索: ' + url)

    let data
    try {
        const resp = await $fetch.get(url, {
            headers: { 'User-Agent': UA, 'Accept-Language': 'en-US,en;q=0.9' },
            timeout: 20000,
        })
        data = resp.data
    } catch (e) {
        $print('搜索失败: ' + e)
        return jsonify({ list: [] })
    }

    const cards = parseList(data)
    $print('✓ 搜索到 ' + cards.length + ' 个结果')
    return jsonify({ list: cards })
}
