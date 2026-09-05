#!/usr/bin/env elixir

Mix.install([
  {:req, "~> 0.5.0"},
  {:jason, "~> 1.4"}
])

defmodule TdmEpg do
  @channels [
    %{id: 1, xml_id: "tdm.oumun", name_zh: "澳視澳門", name_en: "TDM Ou Mun"},
    %{id: 2, xml_id: "tdm.canal", name_zh: "澳視葡文", name_en: "Canal Macau"},
    %{id: 5, xml_id: "tdm.info", name_zh: "澳門資訊", name_en: "TDM Informação"},
    %{id: 6, xml_id: "tdm.sport", name_zh: "澳視體育", name_en: "TDM Desporto"},
    %{id: 7, xml_id: "tdm.variety", name_zh: "澳門綜藝", name_en: "TDM Entretenimento"},
    %{id: 8, xml_id: "tdm.macau", name_zh: "澳門-Macau", name_en: "Macau Satellite"}
  ]

  def run do
    # 1. 计算澳门时间（UTC+8）的“昨天”到“7天后”
    now_macau = DateTime.utc_now() |> DateTime.add(8 * 3600, :second)
    today = DateTime.to_date(now_macau)
    date_range = Date.range(Date.add(today, -1), Date.add(today, 7))

    IO.puts("正在抓取日期范围: #{Date.to_string(Date.add(today, -1))} 至 #{Date.to_string(Date.add(today, 7))}")

    # 2. 生成所有需要请求的任务（Channel × Date）
    tasks = for ch <- @channels, date <- date_range, do: {ch, Date.to_string(date)}

    # 3. 并发拉取数据
    raw_data =
      tasks
      |> Task.async_stream(
        fn {ch, date_str} ->
          url = "https://apps.tdm.com.mo/api/v1.0/program-list/#{date_str}?type=tv&channelId=#{ch.id}&date=#{date_str}"
          case Req.get(url, receive_timeout: 10_000) do
            {:ok, %{status: 200, body: %{"data" => list}}} when is_list(list) ->
              {ch, list}
            _ ->
              {ch, []}
          end
        end,
        max_concurrency: 8,
        timeout: 15_000
      )
      |> Enum.flat_map(fn {:ok, res} -> [res] end)

    # 4. 按频道聚合节目并排序去重
    channels_xml =
      @channels
      |> Enum.map_join("\n", fn ch ->
        """
          <channel id="#{ch.xml_id}">
            <display-name lang="zh">#{ch.name_zh}</display-name>
            <display-name lang="en">#{ch.name_en}</display-name>
          </channel>
        """ |> String.trim_trailing()
      end)

    programmes_xml =
      @channels
      |> Enum.map_join("\n", fn ch ->
        programs =
          raw_data
          |> Enum.filter(fn {c, _} -> c.id == ch.id end)
          |> Enum.flat_map(fn {_, list} -> list end)
          |> Enum.uniq_by(fn item -> {item["date"], item["title"]} end)
          |> Enum.sort_by(fn item -> item["date"] end)

        build_channel_programmes(ch.xml_id, programs)
      end)

    xml = """
    <?xml version="1.0" encoding="UTF-8"?>
    <!DOCTYPE tv SYSTEM "xmltv.dtd">
    <tv generator-info-name="TDM-EPG-Elixir-Generator">
    #{channels_xml}
    #{programmes_xml}
    </tv>
    """

    # 5. Gzip 压缩并保存到 parts/tdm.xml.gz
    #File.mkdir_p!("parts")
    gz_data = :zlib.gzip(xml)
    File.write!("parts/tdm.xml.gz", gz_data)

    IO.puts("成功生成: parts/tdm.xml.gz (大小: #{byte_size(gz_data)} 字节)")
  end

  defp build_channel_programmes(_xml_id, []), do: ""

  defp build_channel_programmes(xml_id, programs) do
    programs
    |> Enum.chunk_every(2, 1, :discard)
    |> Enum.map(fn [curr, nxt] ->
      start_fmt = format_epg_time(curr["date"])
      stop_fmt = format_epg_time(nxt["date"])
      render_programme(xml_id, curr, start_fmt, stop_fmt)
    end)
    |> then(fn list ->
      # 处理最后一个节目（默认持续 1 小时）
      last = List.last(programs)
      last_start = format_epg_time(last["date"])
      last_stop = format_epg_time_plus_one_hour(last["date"])
      list ++ [render_programme(xml_id, last, last_start, last_stop)]
    end)
    |> Enum.join("\n")
  end

  defp render_programme(xml_id, prog, start_fmt, stop_fmt) do
    title = escape_xml(prog["title"] || "")
    lang = prog["programLang"] || "zh-hant"
    desc_tag =
      if prog["slug"] && prog["slug"] != "" do
        "\n    <desc lang=\"#{lang}\">#{escape_xml(prog["slug"])}</desc>"
      else
        ""
      end

    """
      <programme start="#{start_fmt}" stop="#{stop_fmt}" channel="#{xml_id}">
        <title lang="#{lang}">#{title}</title>#{desc_tag}
      </programme>
    """ |> String.trim_trailing()
  end

  defp format_epg_time(date_str) do
    # "2026-09-03 09:59:00" -> "20260903095900 +0800"
    date_str
    |> String.replace(~r/[-: ]/, "")
    |> Kernel.<>(" +0800")
  end

  defp format_epg_time_plus_one_hour(date_str) do
    {:ok, naive} = NaiveDateTime.from_iso8601(String.replace(date_str, " ", "T"))
    naive
    |> NaiveDateTime.add(3600, :second)
    |> NaiveDateTime.to_string()
    |> format_epg_time()
  end

  defp escape_xml(str) do
    str
    |> String.replace("&", "&amp;")
    |> String.replace("<", "&lt;")
    |> String.replace(">", "&gt;")
    |> String.replace("\"", "&quot;")
  end
end

TdmEpg.run()
