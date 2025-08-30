#!/usr/bin/env node
import fs from "fs";
import { Command } from "commander";
const program = new Command();

program
    .name("marcus")
    .description("CLI to parse markdown to html code")
    .version("0.0.1");

function markdown_to_html_parser(content: string) {
    const lines = content.split("\n");
    let processed: string[] = [];
    let listType: "ul" | "ol" | null = null;

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i];
        let processed_line = true;

        //horizontal rules ( - - - )
        if (/^(\-\-\-|\*\*\*|\_\_\-)$/.test(line.trim())) {
            processed.push("<hr>");
            processed_line = true;
            continue;
        }

        //headings
        if (/^# (.+)$/.test(line)) {
            processed.push(line.replace(/^# (.+)$/, "<h1>$1</h1>"));
            processed_line = true;
            continue;
        }
        if (/^## (.+)$/.test(line)) {
            processed.push(line.replace(/^## (.+)$/, "<h2>$1</h2>"));
            processed_line = true;
            continue;
        }
        if (/^### (.+)$/.test(line)) {
            processed.push(line.replace(/^### (.+)$/, "<h3>$1</h3>"));
            processed_line = true;
            continue;
        }
        if (/^#### (.+)$/.test(line)) {
            processed.push(line.replace(/^#### (.+)$/, "<h4>$1</h4>"));
            processed_line = true;
            continue;
        }
        if (/^##### (.+)$/.test(line)) {
            processed.push(line.replace(/^##### (.+)$/, "<h5>$1</h5>"));
            processed_line = true;
            continue;
        }
        if (/^###### (.+)$/.test(line)) {
            processed.push(line.replace(/^###### (.+)$/, "<h6>$1</h6>"));
            processed_line = true;
            continue;
        }

        //blockquotes
        if (line.startsWith("> ")) {
            //put everything inside the blockquote, except (> and " ")
            processed.push(`<blockquote>${line.substring(2)}</blockquote>`);
            processed_line = true;
            continue;
        }

        //unordered list
        if (/^(\*|\-|\+) (.*)/.test(line)) {
            if (listType !== "ul") {
                // if found ordered list instead of unordered list, close it.
                if (listType === "ol") processed.push("</ol>");
                processed.push("<ul>");
                listType = "ul";
            }
            processed.push(line.replace(/^(\*|\-|\+) (.*)/, "<li>$2</li>"));
            processed_line = true;
            continue;
        }

        //ordered list
        if (/^\d+\. (.*)/.test(line)) {
            if (listType !== "ol") {
                if (listType === "ul") processed.push("</ul>");
                processed.push("<ol>");
                listType = "ol";
            }
            processed.push(line.replace(/^\d+\. (.*)/, "<li>$1</li>"));
            processed_line = true;
            continue;
        }

        //close list if no more list items
        if(listType && !(/^(\*|\-|\+)(.*)/.test(line))){
            processed.push(listType === "ul" ? '</ul>' : '</li>')
            listType = null
        }

        //paragraphs
        if(!processed_line && line.trim() !== ""){
            if(line.trim().startsWith("<")){
                processed.push(`<p>${line}</p>`)
                processed_line = true;
                continue
            }
        }

        if(!processed_line){
            processed.push(line)
        }
    }

    if (listType) {
        processed.push(listType === "ul" ? "</ul>" : "</ol>");
    }

    let html = processed.join("\n");

    //images
    html = html.replace(
        /!\[(.*?)\]\((.*?)\)/g,
        '<img src="$2" alt="$1" class="rounded-lg shadow-md"/>'
    );

    //strikethrough
    html = html.replace(/~~(.*?)~~/g, "<del>$1</del>");

    //bold
    html = html.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
    html = html.replace(/__(.*?)__/g, "<strong>$1</strong>");

    //inline code
    html = html.replace(
        /`(.*?)`/g,
        '<code class="bg-gray-200 text-red-600 rounded px-1.5 py-1 text-sm">$1</code>'
    );

    return html;
}

program
    .argument("<filepath>", "markdown file to process")
    .action((filepath) => {
        fs.readFile(filepath, "utf8", (err, data) => {
            if (err) {
                console.error("Error reading file:", err);
                return;
            }
            console.log(markdown_to_html_parser(data));
        });
    });

program.parse();
