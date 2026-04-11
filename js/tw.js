const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const BASE_URL = 'https://twitter-ero-video-ranking.com';

let appConfig = {
    ver: 20260411,
    title: 'Twitter视频排行',
    site: BASE_URL,
    tabs: [
        {
            name: '每日排行',
            ui: 1,
            ext: {
                range: '',
                sort: 'favorite',
            },
        },
        {
            name: '每周排行',
            ui: 1,
            ext: {
                range: 'weekly',
                sort: 'favorite',
            },
        },
        {
            name: '每月排行',
            ui: 1,
            ext: {
                range: 'monthly',
                sort: 'favorite',
            },
        },
        {
            name: '所有时间',
            ui: 1,
            ext: {
                range: 'all',
                sort: 'favorite',
            },
        },
        {
            name: '按观看数',
            ui: 1,
            ext: {
                range: '',
                sort: 'pv',
            },
        },
        {
            name: '素人',
            ui: 1,
            ext: {
                range: '',
                sort: 'favorite',
                category: 'shirouto',
            },
        },
        {
            name: '巨乳',
            ui: 1,
            ext: {
                range: '',
                sort: 'favorite',
                category: 'kyonyu',
            },
        },
        {
            name: '美少女',
            ui: 1,
            ext: {
                range: '',
                sort: 'favorite',
                category: 'beautiful-girl',
            },
        },
        {
            name: '人妻',
            ui: 1,
            ext: {
                range: '',
                sort: 'favorite',
                category: 'married-woman',
            },
        },
        {
            name: 'ハメ撮り',
            ui: 1,
            ext: {
                range: '',
                sort: 'favorite',
                category: 'hamedori',
            },
        },
        {
            name: '個人撮影',
            ui: 1,
            ext: {
                range: '',
                sort: 'favorite',
                category: 'personal-filming',
            },
        },
        {
            name: '無修正',
            ui: 1,
            ext: {
                range: '',
                sort: 'favorite',
                category: 'uncensored',
            },
        },
    ],
};

async function getConfig() {
    return jsonify(appConfig);
}

async function getCards(ext) {
    ext = argsify(ext);
    let cards = [];
    let page = ext.page || 1;
    let range = ext.range || '';
    let sort = ext.sort || 'favorite';
    let category = ext.category || '';

    let url = `${BASE_URL}/api/media?range=${range}&page=${page}&per_page=50&category=${category}&ids=&isAnimeOnly=0&sort=${sort}`;

    try {
        const { data } = await $fetch.get(url, {
            headers: {
                'User-Agent': UA,
                'Refer': BASE_URL + '/',
                'Accept': 'application/json',
            },
        });

        let jsonData = typeof data === 'string' ? JSON.parse(data) : data;
        let items = jsonData.items || [];

        items.forEach((item) => {
            let name = '';
            if (item.tweet_account) {
                name = '@' + item.tweet_account;
            } else {
                name = item.url_cd || '';
            }
            let remarks = '❤' + (item.favorite || '0') + ' 👁' + (item.pv || '0');
            if (item.time) {
                let min = Math.floor(item.time / 60);
                let sec = item.time % 60;
                remarks += ' ⏱' + min + ':' + String(sec).padStart(2, '0');
            }

            cards.push({
                vod_id: item.url_cd,
                vod_name: name,
                vod_pic: item.thumbnail || '',
                vod_remarks: remarks,
                ext: {
                    url_cd: item.url_cd,
                    mp4_url: item.url || '',
                    thumbnail: item.thumbnail || '',
                    tweet_account: item.tweet_account || '',
                    tweet_url: item.tweet_url || '',
                    favorite: item.favorite || '0',
                    pv: item.pv || '0',
                    time: item.time || 0,
                    posted_at: item.posted_at || '',
                },
            });
        });
    } catch (e) {
        $print('getCards error: ' + e.message);
    }

    return jsonify({
        list: cards,
    });
}

async function getTracks(ext) {
    ext = argsify(ext);
    let tracks = [];

    // mp4_url 直接从 ext 获取（由 getCards 传入）
    let mp4Url = ext.mp4_url || '';

    if (!mp4Url) {
        // 如果没有直接传过来，尝试通过 API 获取
        let urlCd = ext.url_cd || ext.vod_id || '';
        if (urlCd) {
            try {
                let apiUrl = `${BASE_URL}/api/media?range=&page=1&per_page=1&category=&ids=${urlCd}&isAnimeOnly=0&sort=favorite`;
                const { data } = await $fetch.get(apiUrl, {
                    headers: {
                        'User-Agent': UA,
                        'Referer': BASE_URL + '/',
                    },
                });
                let jsonData = typeof data === 'string' ? JSON.parse(data) : data;
                if (jsonData.items && jsonData.items.length > 0) {
                    mp4Url = jsonData.items[0].url || '';
                }
            } catch (e) {
                $print('getTracks fallback error: ' + e.message);
            }
        }
    }

    if (mp4Url) {
        tracks.push({
            name: '播放',
            pan: '',
            ext: {
                url: mp4Url,
            },
        });
    }

    return jsonify({
        list: [
            {
                title: '默认分组',
                tracks: tracks,
            },
        ],
    });
}

async function getPlayinfo(ext) {
    ext = argsify(ext);
    let url = ext.url || '';
    return jsonify({
        urls: [url],
        headers: [
            {
                'User-Agent': UA,
                'Referer': BASE_URL + '/',
            },
        ],
    });
}

async function search(ext) {
    ext = argsify(ext);
    let cards = [];
    let text = (ext.text || '').toLowerCase();
    let page = ext.page || 1;

    if (!text) {
        return jsonify({ list: cards });
    }

    try {
        // 先获取标签列表，匹配搜索词
        let tagUrl = `${BASE_URL}/api/tags`;
        const { data: tagData } = await $fetch.get(tagUrl, {
            headers: {
                'User-Agent': UA,
                'Referer': BASE_URL + '/',
            },
        });
        let tags = typeof tagData === 'string' ? JSON.parse(tagData) : tagData;

        let matchedTag = null;
        for (let t of tags) {
            if (
                t.name.toLowerCase().includes(text) ||
                (t.name_zh_cn && t.name_zh_cn.includes(text)) ||
                (t.name_en && t.name_en.toLowerCase().includes(text)) ||
                (t.code && t.code.includes(text)) ||
                (t.name_ko && t.name_ko.includes(text))
            ) {
                matchedTag = t;
                break;
            }
        }

        if (matchedTag) {
            let searchApiUrl = `${BASE_URL}/api/media?range=&page=${page}&per_page=50&category=${matchedTag.code}&sort=favorite`;
            const { data } = await $fetch.get(searchApiUrl, {
                headers: {
                    'User-Agent': UA,
                    'Referer': BASE_URL + '/',
                },
            });
            let jsonData = typeof data === 'string' ? JSON.parse(data) : data;
            let items = jsonData.items || [];

            items.forEach((item) => {
                cards.push({
                    vod_id: item.url_cd,
                    vod_name: item.tweet_account ? '@' + item.tweet_account : item.url_cd,
                    vod_pic: item.thumbnail || '',
                    vod_remarks: '❤' + (item.favorite || '0') + ' 👁' + (item.pv || '0'),
                    ext: {
                        url_cd: item.url_cd,
                        mp4_url: item.url || '',
                        thumbnail: item.thumbnail || '',
                        tweet_account: item.tweet_account || '',
                    },
                });
            });
        }
    } catch (e) {
        $print('search error: ' + e.message);
    }

    return jsonify({
        list: cards,
    });
}
