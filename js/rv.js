const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const appConfig = {
    ver: 1,
    title: '肉视频',
    site: 'https://rou.video',
}

function getConfig() {
    return jsonify({
        ver: appConfig.ver,
        title: appConfig.title,
        site: appConfig.site,
        tabs: [
            { name: '首页',     ext: { tag: '',         page: 1 } },
            { name: '国产AV',   ext: { tag: '國產AV',   page: 1 } },
            { name: '麻豆传媒', ext: { tag: '麻豆傳媒', page: 1 } },
            { name: '自拍流出', ext: { tag: '自拍流出', page: 1 } },
            { name: '探花',     ext: { tag: '探花',     page: 1 } },
            { name: '杏吧传媒', ext: { tag: '杏吧傳媒', page: 1 } },
            { name: '糖心Vlog', ext: { tag: '糖心Vlog', page: 1 } },
        ],
    })
}

async function getCards(ext) {
    ext = argsify(ext)
    let cards = []
    let { tag = '' } = ext

    $print('肉视频 获取列表 tag=' + tag)

    try {
        const response = await $fetch.get(appConfig.site + '/api/v/watching', {
            headers: {
                'User-Agent': UA,
                'Referer': appConfig.site + '/home',
                'Accept': 'application/json',
            },
            timeout: 15000,
        })

        const data = response.data
        if (!Array.isArray(data)) {
            $print('✗ 返回数据格式错误')
            return jsonify({ list: [] })
        }

        data.forEach(video => {
            if (tag && video.tags && !video.tags.includes(tag)) return

            cards.push({
                vod_id: video.id,
                vod_name: video.nameZh || video.name,
                vod_pic: video.coverImageUrl || '',
                vod_remarks: formatDuration(video.duration) + ' | ' + video.viewCount + '次观看',
                ext: { id: video.id },
            })
        })

        $print('✓ 获取到 ' + cards.length + ' 个视频')
    } catch (e) {
        $print('✗ 请求失败: ' + e)
    }

    return jsonify({ list: cards })
}

async function getTracks(ext) {
    ext = argsify(ext)
    const videoId = ext.id

    $print('肉视频 获取播放地址: ' + videoId)

    try {
        // 抓取视频页面 HTML，从 __NEXT_DATA__ 中提取加密的 ev 字段
        const response = await $fetch.get(appConfig.site + '/v/' + videoId, {
            headers: {
                'User-Agent': UA,
                'Referer': appConfig.site + '/home',
                'Accept': 'text/html',
            },
            timeout: 15000,
        })

        const html = response.data
        const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/)
        if (!match) {
            $print('✗ 未找到 __NEXT_DATA__')
            return jsonify({ list: [] })
        }

        const nextData = JSON.parse(match[1])
        const ev = nextData.props && nextData.props.pageProps && nextData.props.pageProps.ev

        if (!ev || !ev.d || ev.k === undefined) {
            $print('✗ 未找到 ev 字段')
            return jsonify({ list: [] })
        }

        // 解密：base64 decode 后每字节减去 k（mod 256）
        const videoUrl = decryptEv(ev)
        if (!videoUrl) {
            $print('✗ ev 解密失败')
            return jsonify({ list: [] })
        }

        $print('✓ 解密播放地址成功')

        return jsonify({
            list: [{
                title: '播放线路',
                tracks: [{
                    name: '默认',
                    pan: '',
                    ext: { url: videoUrl },
                }],
            }],
        })

    } catch (e) {
        $print('✗ 获取播放地址失败: ' + e)
        return jsonify({ list: [] })
    }
}

async function getPlayinfo(ext) {
    ext = argsify(ext)
    const url = ext.url

    $print('肉视频 播放: ' + url)

    return jsonify({
        urls: [url],
        headers: {
            'User-Agent': UA,
            'Referer': appConfig.site + '/',
            'Origin': appConfig.site,
        },
    })
}

async function search(ext) {
    ext = argsify(ext)
    let cards = []
    const text = (ext.text || '').toLowerCase()

    $print('肉视频 搜索: ' + text)

    try {
        const response = await $fetch.get(appConfig.site + '/api/v/watching', {
            headers: {
                'User-Agent': UA,
                'Referer': appConfig.site + '/home',
                'Accept': 'application/json',
            },
            timeout: 15000,
        })

        const data = response.data
        if (Array.isArray(data)) {
            data.forEach(video => {
                const name = (video.nameZh || video.name || '').toLowerCase()
                if (name.indexOf(text) === -1) return
                cards.push({
                    vod_id: video.id,
                    vod_name: video.nameZh || video.name,
                    vod_pic: video.coverImageUrl || '',
                    vod_remarks: formatDuration(video.duration) + ' | ' + video.viewCount + '次观看',
                    ext: { id: video.id },
                })
            })
            $print('✓ 搜索到 ' + cards.length + ' 个结果')
        }
    } catch (e) {
        $print('✗ 搜索失败: ' + e)
    }

    return jsonify({ list: cards })
}

// 解密 ev 字段，返回 videoUrl 字符串
function decryptEv(ev) {
    try {
        const b64 = ev.d
        const k = ev.k

        // atob 解码 base64
        const raw = atob(b64)
        const bytes = new Uint8Array(raw.length)
        for (let i = 0; i < raw.length; i++) {
            bytes[i] = (raw.charCodeAt(i) - k + 256) % 256
        }

        const json = new TextDecoder().decode(bytes)
        const obj = JSON.parse(json)
        return obj.videoUrl || ''
    } catch (e) {
        $print('✗ decryptEv 异常: ' + e)
        return ''
    }
}

function formatDuration(seconds) {
    if (!seconds) return '未知'
    const h = Math.floor(seconds / 3600)
    const m = Math.floor((seconds % 3600) / 60)
    const s = Math.floor(seconds % 60)
    if (h > 0) return h + ':' + pad(m) + ':' + pad(s)
    return m + ':' + pad(s)
}

function pad(n) {
    return n < 10 ? '0' + n : n
}
