module.exports = {
    handle: (Client, msg, args, config) => {
        const jimp = require('jimp');
        const docs = " Refer to the `help` command if necessary."
        // if command isn't invert then an arg is necessary no matter what
        if (args[0] != "invert" && args[0] != "greyscale" && typeof args[1] == 'undefined') return msg.reply(`Command usage error.${docs}`)

        function fixLink(arg) { // remove < > if present
            if (!arg) return // for invert, which would error because of the call when an argument isn't necessary
            var fixedLink = arg
            if (arg.startsWith("<")) fixedLink = fixedLink.substring(1)
            if (arg.endsWith(">")) fixedLink = fixedLink.substring(0, fixedLink.length - 1)
            return fixedLink
        }
        args[1] = fixLink(args[1])

        function getLink() {
            if (msg.attachments.size > 0) return msg.attachments.first().url
            return args[1]? (args[1].startsWith('http')? args[1]:null):null // use arg if no attachment
        }

        var Link = getLink()
        if (!Link) {
            return msg.reply("Image missing. Make sure the format is `[command] {image} {args}`");
        }

        function isCdn(Link) {
            // returns if an image is a cdn.discordapp.com link if you are hosting on your own PC to not get IP grabbed
            var split = Link.split("://") // {protocol, domain}
            return (split[0] == "http" || split[0] == "https") && (
                split[1].startsWith("cdn.discordapp.com") || split[1].startsWith("media.discordapp.net"));
        }

        if (!config.EXTERNAL_HOSTING) // if hosting on your own device
            if (!isCdn(Link)) return msg.reply("Please make sure your link starts with cdn.discordapp.com, or upload your attachment instead.")
        
        const path = require('path')
        function validExt(ext) {
            // input: extension
            // returns if the extension is png, jpg, or jpeg
            switch(ext.substring(1).toLowerCase()) { // .PNG is valid but uppercase, convert it to lowercase; path.extname returns extension starting with a .
                case "png":case"jpg":case"jpeg":return true
            }
            return false
        }
        if (!validExt(path.extname(Link))) return msg.reply(`Invalid image format.${docs}`)

        const crypto = require('crypto')
        function genOutput(Link) {
            // input: image.png
            // returns a new file name so the correct image is uploaded after modification, just in case other images have the same name and are being worked on simultaneously
            var slashSplit = Link.split("/") // the name.extension is after the final slash
            var baseName = slashSplit[slashSplit.length - 1].split(".")[0] // name of the original file
            return `${baseName}-${crypto.randomBytes(2).toString('hex')}.png`
        }
        var output = genOutput(Link)

        switch(args[0]) {
            case "rotate":
                var degree = msg.attachments.size > 0 ? args[1]:args[2]
                switch (degree) {
                    case "left":
                        degree = 90;
                        break;
                    case "right":
                        degree = 270;
                        break;
                    default:
                        degree = Number(degree);
                        if (!(degree > 0 && degree < 360)) {
                            return msg.reply(`Invalid degree; must be in the range of [0, 360).${docs}`);
                        }
                }
                return require('./rotate').run(msg, Link, degree, output, config.SAVE_IMAGES)
                // single argument exists if attachment provided. else, the second argument will be used

            case "resize":
                var resolution = "", resolutionY = ""; // resolution is for ones with 'x' and resolutionY is for separated numbers
                if (msg.attachments.size > 0) {
                    resolution = args[1]; // only argument is a resolution
                    if (args[2]) {
                        resolutionY = args[2]; // if no x (one argument for the dimensions), set resolutionY
                    }
                }
                else {
                    resolution = args[2]; // 2 arguments, first is a link so the second is the res argument
                    if (args[3]) {
                        resolutionY = args[3];
                    }
                }

                resolution = resolution.toLowerCase(); // for the 'x' separating the dimensions
                resolutionY = resolutionY.toLowerCase();
                var res = resolution.split("x"); // res[0] is x, res[1] is y. Nothing happens if there is no X and it's a space instead
                if (resolutionY) {
                    res = [resolution, resolutionY]; // if there is a space instead
                }

                // resolution/dimension validity checks
                if (res[0] != "auto" && res[1] != "auto") {
                    res[0] = Number(res[0]); res[1] = Number(res[1]);
                    var bool = res[0] > 1 && res[0] <= 4096; // 1 pixel isn't clickable on Discord and you don't want more than 4k
                    var bool2 = res[1] > 1 && res[1] <= 4096;
                    var bool3 = Number.isInteger(res[0]);
                    var bool4 = Number.isInteger(res[1]); // JIMP errors with non integers
                    if (!(bool && bool2 && bool3 && bool4)) {
                        return msg.reply(`Invalid dimension(s). Desired side length must be in the range of [1, 4096).${docs}`);
                    }
                }
                else {
                    var intDimension; // will be 0 or 1 depending on which dimension is an integer and need to check
                    if (res[0] != "auto" && res[1] == "auto") { // INTxAUTO
                        intDimension = 0;
                    }
                    else if (res[0] == "auto" && res[1] != "auto") { // AUTOxINT
                        intDimension = 1;
                    }
                    else {
                        return msg.reply(`Invalid dimensions. One dimension must be an integer in the range of [1, 4096).${docs}`);
                    }

                    res[intDimension] = Number(res[intDimension]);
                    var bool = res[intDimension] > 1 && res[intDimension] <= 4096;
                    var bool2 = Number.isInteger(res[intDimension]);
                    if (!(bool && bool2)) {
                        return msg.reply(`Invalid dimension. One dimension must be an integer in the range of [1, 4096).${docs}`);
                    }

                    res[intDimension == 0 ? 1:0] = jimp.AUTO; // not int, must be auto
                }
                return require('./resize').run(msg, Link, res, output, config.SAVE_IMAGES);

            case "mirror":
                var direction = msg.attachments.size > 0 ? args[1]:args[2]
                if (typeof direction == 'undefined') {
                    return msg.reply(`Invalid direction; must be horizontal, vertical, or both.${docs}`)
                }
                var validDirection = false, h = false, v = false, both = false // variable both is for the message reply, other vars are for direction/validity checking
                switch(direction.toLowerCase()) { // checks if the direction is valid
                    case "h":case "horizontal":
                        validDirection = true; h = true
                    break
                    case "v":case "vertical":
                        validDirection = true; v = true
                    break
                    case "both":case"b":case"vh":case"hv":
                        validDirection = true; both = true; h = true; v = true
                }
                var directions = [h, v]
                if (!validDirection) return msg.reply(`Invalid direction. It must be horizontal, vertical, or both.${docs}`)
                return require('./mirror').run(msg, Link, directions, output, config.SAVE_IMAGES)

            case "invert":
                return require('./invert').run(msg, Link, output, config.SAVE_IMAGES)

            case "blur":
                var r = Number(msg.attachments.size > 0 ? args[1]:args[2])
                if (isNaN(r) || r <= 0) return msg.reply(`Invalid value provided; must be greater than 0.${docs}`)
                return require('./blur').run(msg, Link, r, output, config.SAVE_IMAGES)

            case "brightness":
                var p = Number(msg.attachments.size > 0 ? args[1]:args[2])
                if (!(p >= -100 && p <= 100)) {
                    return msg.reply(`Invalid percentage provided; must in the range of [-100, 100].${docs}`) 
                }
                return require('./brightness').run(msg, Link, p, output, config.SAVE_IMAGES)

            case "contrast":
                var p = Number(msg.attachments.size > 0 ? args[1]:args[2])
                if (!(p >= -100 && p <= 100)) {
                    return msg.reply(`Invalid percentage provided; must in the range of [-100, 100].${docs}`) 
                }
                return require('./contrast').run(msg, Link, p, output, config.SAVE_IMAGES)

            case "greyscale":
                require('./greyscale').run(msg, Link, output, config.SAVE_IMAGES)

        }
    }
}
