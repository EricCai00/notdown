if (.Platform$OS.type == "windows") invisible(suppressWarnings(Sys.setlocale("LC_CTYPE", ".UTF-8")))
for (package in c("knitr", "rmarkdown", "jsonlite"))
  if (!requireNamespace(package, quietly = TRUE)) stop(paste("Missing R package:", package))
if (!rmarkdown::pandoc_available()) stop("Pandoc is required")
options(encoding = "UTF-8")
notebook_env <- new.env(parent = globalenv())
knitr::opts_chunk$set(notdown.notebook = TRUE, error = FALSE, fig.width = 7, fig.height = 4.3)
# Notebook runs are explicit console-style evaluation. Publication visibility
# options stay intact in the source and are honored by the separate Knit path.
knitr::opts_hooks$set(notdown.notebook = function(options) {
  options$eval <- TRUE
  options$echo <- FALSE
  options$include <- TRUE
  options$cache <- FALSE
  options$comment <- ""
  options$warning <- TRUE
  options$message <- TRUE
  options$results <- "markup"
  options
})
input <- file("stdin", open = "r")
cat("NOTDOWN_READY\n"); flush.console()
repeat {
  line <- readLines(input, n = 1, warn = FALSE)
  if (!length(line)) break
  request <- jsonlite::fromJSON(line, simplifyVector = FALSE)
  result <- tryCatch({
    # Parameters belong to the captured document; ordinary variables persist
    # in this worker's environment between explicitly requested chunk runs.
    writeLines(request$document, "document.Rmd", useBytes = TRUE)
    parameters <- knitr::knit_params(readLines("document.Rmd", warn = FALSE))
    notebook_env$params <- lapply(parameters, function(parameter) parameter$value)
    outputs <- list()
    if (!is.null(request$expression)) {
      text <- capture.output({
        value <- eval(parse(text = request$expression), envir = notebook_env)
        if (!is.atomic(value) && !is.null(value)) stop("Inline R expressions must return text values")
        print(value)
      })
      list(outputs = list(list(index = request$index, text = paste(text, collapse = "\n"))))
    } else {
      for (chunk in request$chunks) {
        item <- tryCatch({
          markdown <- knitr::knit(text = chunk$source, envir = notebook_env, quiet = TRUE)
          writeLines(markdown, "output.md", useBytes = TRUE)
          rmarkdown::pandoc_convert("output.md", to = "html", output = "output.html",
            options = c("--standalone", "--self-contained", "--metadata", "pagetitle=R output"), verbose = FALSE)
          list(index = chunk$index, html = paste(readLines("output.html", warn = FALSE, encoding = "UTF-8"), collapse = "\n"))
        }, error = function(error) list(index = chunk$index, error = conditionMessage(error)))
        outputs[[length(outputs) + 1]] <- item
        if (!is.null(item$error)) break
      }
      list(outputs = outputs)
    }
  }, error = function(error) list(error = conditionMessage(error)))
  jsonlite::write_json(result, paste0("reply-", request$id, ".json"), auto_unbox = TRUE, null = "null")
  cat(paste0("NOTDOWN_REPLY:", request$id, "\n")); flush.console()
}
