import {
    HomeSection,
    HomeSectionType,
    PartialSourceManga,
} from "@paperback/types"

import * as cheerio from "cheerio"

const DOMAIN = "https://w1.hotcomics.me"

export const parseHomeSections = async (
    source: any,
    sectionCallback: (section: HomeSection) => void
): Promise<void> => {

    const request = App.createRequest({
        url: `${DOMAIN}/en`,
        method: "GET",
    })

    const response = await source.requestManager.schedule(request, 1)
    const $ = cheerio.load(response.data as string)

    const hotSection = App.createHomeSection({
        id: "catalogue",
        title: "Hot Comics",
        containsMoreItems: true,
        type: HomeSectionType.singleRowLarge,
    })

    const manga: PartialSourceManga[] = []
    const ids = new Set<string>()

    $("div.section-hotcomic ul.slick-item > li").each((_, element) => {

        const unit = $(element)

        const link = unit.find("a").first()

        const href = link.attr("href") ?? ""

        if (!href)
            return

        const mangaId = href
            .replace(`${DOMAIN}/en/`, "")
            .replace(".html", "")

        if (!mangaId || ids.has(mangaId))
            return

        ids.add(mangaId)

        const title =
            unit.find("h4.title").text().trim()

        const image =
            unit.find("img").attr("data-src") ??
            unit.find("img").attr("src") ??
            ""

        const subtitle =
            unit.find("p.writer span")
                .map((_, el) => $(el).text().trim())
                .get()
                .join(", ")

        manga.push(
            App.createPartialSourceManga({
                mangaId,
                title,
                image,
                subtitle,
            })
        )
    })

    hotSection.items = manga

    sectionCallback(hotSection)
}