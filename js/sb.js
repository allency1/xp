const UA =
	'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const cheerio = createCheerio()
let appConfig = {
	ver: 2,
	title: 'spankbang',
	site: 'https://jp.spankbang.com',
	tabs: [
		{
			name: '最新',
			ui: 1,
			ext: {
				id: 'new_videos',
			},
		},
		{
			name: '热门',
			ui: 1,
			ext: {
				id: 'trending_videos',
			},
		},
	],
}

// 年龄验证 cookie（SpankBang 用 av=simple:True:True 标记已确认年龄）
const COOKIE = 'av=simple:True:True'

// 统一请求头：完整 UA + Accept + 年龄 cookie，可选 Referer，尽量像真浏览器以减少 CF 拦截
function webHeaders(referer) {
	const h = {
		'User-Agent': UA,
		Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
		'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
		Cookie: COOKIE,
	}
	if (referer) h.Referer = referer
	return h
}

async function getConfig() {
	return jsonify(appConfig)
}

// 解析视频卡片列表（getCards 和 search 共用）。SpankBang 改版后用 .js-video-item 容器，
// 封面在 <picture><img src> 里，标题在 img 的 alt
function parseCards($) {
	let cards = []
	$('.js-video-item').each((_, e) => {
		const href = $(e).find('a[href*="/video/"]').attr('href')
		if (!href) return
		const img = $(e).find('img').first()
		const title = img.attr('alt') || ''
		const cover = img.attr('src') || img.attr('data-src') || ''
		cards.push({
			vod_id: href,
			vod_name: title,
			vod_pic: cover,
			ui: 1,
			ext: {
				url: `${appConfig.site}${href}`,
			},
		})
	})
	return cards
}

async function getCards(ext) {
	ext = argsify(ext)
	let { page = 1, id } = ext

	// 末尾带斜杠，避免 301 跳转
	const url = appConfig.site + `/${id}/${page}/`

	const { data } = await $fetch.get(url, {
		headers: webHeaders(appConfig.site + '/'),
	})

	// Cloudflare 拦截 → 弹浏览器
	if (data.includes('Just a moment') || data.includes('cf-challenge')) {
		$utils.openSafari(url, UA)
		return jsonify({ list: [] })
	}

	const $ = cheerio.load(data)
	let cards = parseCards($)

	// 一张都没解析到，多半是年龄墙/CF/区域限制，弹浏览器让用户处理
	if (cards.length === 0) {
		$utils.openSafari(url, UA)
	}

	return jsonify({
		list: cards,
	})
}

async function getTracks(ext) {
	ext = argsify(ext)
	let url = ext.url
	let tracks = []

	const { data } = await $fetch.get(url, {
		headers: webHeaders(appConfig.site + '/'),
	})

	// 从 script 标签中提取 stream_data（单引号 JS 对象）
	const streamDataMatch = data.match(/var stream_data\s*=\s*(\{[^;]+\});/)
	if (streamDataMatch && streamDataMatch[1]) {
		try {
			const jsonString = streamDataMatch[1].replace(/'/g, '"')
			const streamData = JSON.parse(jsonString)

			// mp4 各清晰度
			const qualityOrder = ['240p', '320p', '480p', '720p', '1080p', '4k']
			qualityOrder.forEach((quality) => {
				if (streamData[quality] && streamData[quality].length > 0) {
					tracks.push({
						name: quality.toUpperCase(),
						pan: '',
						ext: {
							url: streamData[quality][0],
							type: 'mp4',
						},
					})
				}
			})

			// m3u8 自适应
			if (streamData.m3u8 && streamData.m3u8.length > 0) {
				tracks.push({
					name: 'M3U8 (自适应)',
					pan: '',
					ext: {
						url: streamData.m3u8[0],
						type: 'm3u8',
					},
				})
			}

			// 默认「自动」放最前：优先 main，否则第一个
			let defaultUrl = ''
			let defaultType = 'mp4'
			if (streamData.main && streamData.main.length > 0) {
				defaultUrl = streamData.main[0]
				defaultType = defaultUrl.indexOf('.m3u8') !== -1 ? 'm3u8' : 'mp4'
			} else if (tracks.length > 0) {
				defaultUrl = tracks[0].ext.url
				defaultType = tracks[0].ext.type
			}
			if (defaultUrl) {
				tracks.unshift({
					name: '自动',
					pan: '',
					ext: {
						url: defaultUrl,
						type: defaultType,
					},
				})
			}
		} catch (error) {
			// 静默处理解析错误
		}
	}

	return jsonify({
		list: [
			{
				title: '视频质量',
				tracks,
			},
		],
	})
}

async function getPlayinfo(ext) {
	ext = argsify(ext)
	const url = ext.url
	const type = ext.type || 'mp4'

	// sb-cd.com 的 mp4 直链需要 Referer，否则被拒（m3u8 不强制，但带上无害）
	return jsonify({
		urls: [url],
		type: type,
		headers: {
			'User-Agent': UA,
			Referer: appConfig.site + '/',
		},
	})
}

async function search(ext) {
	ext = argsify(ext)

	let text = encodeURIComponent(ext.text)
	let page = ext.page || 1
	let url = `${appConfig.site}/s/${text}/${page}/`

	const { data } = await $fetch.get(url, {
		headers: webHeaders(appConfig.site + '/'),
	})

	if (data.includes('Just a moment') || data.includes('cf-challenge')) {
		$utils.openSafari(url, UA)
		return jsonify({ list: [] })
	}

	const $ = cheerio.load(data)
	let cards = parseCards($)

	return jsonify({
		list: cards,
	})
}
