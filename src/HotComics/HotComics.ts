import {
    ChapterProviding,
    ContentRating,
    CloudflareBypassRequestProviding,
    HomePageSectionsProviding,
    MangaProviding,
    PagedResults,
    Request,
    Response,
    SearchRequest,
    SearchResultsProviding,
    SourceInfo,
    SourceIntents,
    SourceManga,
    ChapterDetails,
    Chapter,
    HomeSection,
    TagSection,
    PartialSourceManga,
} from '@paperback/types'

import * as cheerio from 'cheerio'

import {
    parseHomeSections,
} from './HotComicsParser'

const DOMAIN = "https://w1.hotcomics.me";

export const HotComicsInfo: SourceInfo = {
    version: '1.0',
    name: 'HotComics',
    description: `Extension that pulls manga from ${DOMAIN}`,
    author: 'Atomicman',
    icon: 'icon.png',
    contentRating: ContentRating.MATURE,
    websiteBaseURL: DOMAIN,
    intents:
        SourceIntents.MANGA_CHAPTERS |
        SourceIntents.HOMEPAGE_SECTIONS |
        SourceIntents.CLOUDFLARE_BYPASS_REQUIRED,
    sourceTags: []
}

export class HotComics
    implements
        ChapterProviding,
        HomePageSectionsProviding,
        MangaProviding,
        SearchResultsProviding,
        CloudflareBypassRequestProviding
{
    requestManager = App.createRequestManager({
        requestsPerSecond: 5,
        requestTimeout: 10000,
        interceptor: {
            interceptRequest: async (request: Request): Promise<Request> => {
                request.headers = {
                    ...(request.headers ?? {}), ...{
                        origin: `https://w1.hotcomics.me`,
                        referer: `https://w1.hotcomics.me`,
                        "user-agent": await this.requestManager.getDefaultUserAgent(),
                        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
                        "accept-language": "en-US,en;q=0.5",
                        "accept-encoding": "gzip, deflate, br",
                    },
                };

                request.url = request.url.replace(/^http:/, 'https:')

                return request;
            },

            interceptResponse: async (response: Response): Promise<Response> => {
                if (response.headers.location) {
                    response.headers.location = response.headers.location.replace(/^http:/, 'https:')
                }
                return response
            }
        }
    })

    async getMangaDetails(mangaId: string): Promise<SourceManga> {
        const request = App.createRequest({
            url: `${DOMAIN}/en/${mangaId}.html`,
            method: 'GET',
        })

        const response = await this.requestManager.schedule(request, 1)
        const $ = cheerio.load(response.data as string)
        console.log(response.data as string);

        const title = $("h1").first().text().trim();
        const image =
         $('meta[property="og:image"]').attr("content") ?? "";
            

        // Status is always ONGOING for comics unless explicitly stated as completed
        const status = "ONGOING";

        // Rating - No rating shown on the site, default to 0
        const rating = 0;
        const description = "";
        const tags: TagSection[] = [];
        

        return App.createSourceManga({
            id: mangaId,
            mangaInfo: App.createMangaInfo({
                titles: [title],
                image: image,
                desc: description,
                status: status,
                rating: rating,
                author: "",
                tags: [],
                hentai: false
            })
        });
    }

    async getHomePageSections(
        sectionCallback: (section: HomeSection) => void
    ): Promise<void> {
        await parseHomeSections(this, sectionCallback)
    }

    async getSearchResults(query: SearchRequest, metadata: any): Promise<PagedResults> {
        const collectedIds: string[] = metadata?.collectedIds ?? [];
        const page: number = metadata?.page ?? 1;
        const searchTerm = query.title ?? "";
        
        // If search term is empty, just return catalogue results (same parsing as viewMore)
        if (!searchTerm.trim()) {
            return await this.getViewMoreItems('catalogue', { page, collectedIds });
        }
        
        // Original search logic for when search term is provided
        const request = App.createRequest({
            url: `${DOMAIN}/en/search?keyword=${encodeURIComponent(searchTerm)}`,
            method: 'GET',
        })

        const response = await this.requestManager.schedule(request, 1)
        const $ = cheerio.load(response.data as string)

        const results: PartialSourceManga[] = []
        const newCollectedIds = [...collectedIds];
        


         $("ul.normal > li").each((_, element) => {
             const unit = $(element);

             const link = unit.find("a").first();

             const title = unit.find("h4.title").text().trim();

             const image = unit.find("img").attr("src") ?? "";

             const href = link.attr("href") ?? "";

             const mangaId = href
                 .replace(`${DOMAIN}/en/`, "")
                 .replace(".html", "");

             const subtitle = unit.find("p.writer span").text().trim();

              if (title && mangaId && !newCollectedIds.includes(mangaId)) {
                newCollectedIds.push(mangaId);
                results.push(App.createPartialSourceManga({
                  mangaId,
                  image,
                  title,
                  subtitle
            })
        );
    }
});

        return App.createPagedResults({
            results: results,
            metadata: undefined
        });
    }

    // private async getMangaIdFromChapter(chapterId: string): Promise<string> {
    //     const request = App.createRequest({
    //         url: `${DOMAIN}/en/${chapterId}.html`,
    //         method: "GET",
    //     });

    //     const response = await this.requestManager.schedule(request, 1);
    //     const $ = cheerio.load(response.data as string);

    //     const canonical = $('link[rel="canonical"]').attr("href") ?? "";
    //     const match = canonical.match(/\/en\/([^/]+)\//);
    //     if (!match) {
    //     throw new Error("Manga ID not found");
    //     }

    //     return match[1];
    // }

    async getViewMoreItems(homepageSectionId: string, metadata: any): Promise<PagedResults> {
        const page: number = metadata?.page ?? 1;
        const collectedIds: string[] = metadata?.collectedIds ?? [];

        let url: string;
        
        switch (homepageSectionId) {
            case 'catalogue':
                url = `${DOMAIN}/en`;
                break;
            default:
                throw new Error(`Unsupported section ID: ${homepageSectionId}`);
        }
        
        const request = App.createRequest({
            url: url,
            method: 'GET',
        })

        const response = await this.requestManager.schedule(request, 1)
        const $ = cheerio.load(response.data as string)

        const results: PartialSourceManga[] = []
        const newCollectedIds = [...collectedIds]

         if (homepageSectionId === 'catalogue') {
               for (const element of $("ul.normal > li").toArray()) {

                 const unit = $(element);

                 const link = unit.find("a").first();

                 const href = link.attr("href") ?? "";
 
                 const mangaId = href
                     .replace(`${DOMAIN}/en/`, "")
                     .replace(".html", "");

                 const title = unit.find("h4.title").text().trim();

                 const image = unit.find("img").attr("src") ?? "";

                 const subtitle = unit.find("p.writer span").text().trim();

                 if (title && mangaId && !newCollectedIds.includes(mangaId)) {

                     newCollectedIds.push(mangaId);

                     results.push(App.createPartialSourceManga({
                         mangaId,
                         image,
                         title,
                         subtitle
            })
        );
    }
}
}
         

          metadata = {
             page: page + 1,
             collectedIds: newCollectedIds
          };

         return App.createPagedResults({
             results: results,
             metadata: metadata
             });
}

     async getChapters(mangaId: string): Promise<Chapter[]> {
             return [App.createChapter({
             id: "test",
             chapNum: 1,
             name: "Test Chapter",
             langCode: "en"
        })
    ];
}
            async getChapterDetails(mangaId: string, chapterId: string): Promise<ChapterDetails> {
            const request = App.createRequest({
            url: `${DOMAIN}/en/${mangaId}/${chapterId}.html`,
            method: "GET",
            });

            const response = await this.requestManager.schedule(request, 1);

            const html = response.data as string;

            if (html.includes("viewer-imgs")) {
            return App.createChapterDetails({
                id: chapterId,
                mangaId: mangaId,
                pages: [
                    "https://picsum.photos/800/1200"
                ]
            });
            }

            throw new Error("viewer-imgs NOT FOUND");
            }

            async getCloudflareBypassRequestAsync(): Promise<Request> {
            return App.createRequest({
                url: DOMAIN,
                method: "GET",
                headers: {
                    referer: DOMAIN,
                    origin: DOMAIN,
                    "user-agent": await this.requestManager.getDefaultUserAgent()
                }
            });
        }

        getMangaShareUrl(mangaId: string): string {
            return `${DOMAIN}/en/${mangaId}.html`;
        }
    }
