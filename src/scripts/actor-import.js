class ActorImporter extends FilePicker {
    constructor(options = {}) {
        super(options);
        this._initHooks();
    }

    _initHooks() {
        Hooks.on("getActorDirectoryFolderContext", (html, list) => {
            list.push({
                name: "Create Actors from folder",
                icon: "<i class='fas fa-user-friends'></i>",
                callback: async directory => {
                    this.ParentDirectoryId = directory.parent().attr("data-folder-id");
                    this.render(true);
                }
            })
        })
    }

    get actorTypes() {
        return game.system.entityTypes.Actor;
    }

    /**
     * Override Title
     */
    get title() {
        return "Actor Directory Browser";
    }

    /**
     * Override Can Upload
     */
    get canUpload() {
        return false;
    }

    /**
     * Extend Browse to store current directory
     */
    async browse(target, options = {}) {
        this.TargetDirectory = await super.browse(target, options);
    }

    /**
     * Extend Default Options
     */
    static get defaultOptions() {
        return mergeObject(
            super.defaultOptions,
            {
                template: "modules/create-actors-from-folder/src/templates/actor-import.html"
            }
        );
    }

    /**
     * Override Submit handler to begin import
     */
    _onSubmit(ev) {
        ev.preventDefault();
        this._promptOptions();
        // this._startImport();
        this.close();
    }

    async _promptOptions() {
        let templateData = { types: game.system.entityTypes["Actor"] };
        let dlg = await renderTemplate("modules/create-actors-from-folder/src/templates/actor-import-options.html", templateData);

        new Dialog({
            title: "Create Actor Options",
            content: dlg,
            buttons: {
                create: {
                    icon: '<i class="fas fa-check"></i>',
                    label: "Create Actors",
                    callback: dlg => {
                        let formElement = dlg.find("#actor-import-options")[0];
                        this._startImport(new FormDataExtended(formElement).toObject());
                    }
                }
            },
            default: "create"
        }).render(true);
    }

    /**
     * Import Actors from selected Directory
     */
    async _startImport(options) {
        this.Directories = [];
        this.Files = [];

        const actorType = options.type;
        const dontCreateDuplicate = options.duplicate;
        const actorSet = new Set();

        const parentDirectory = game.folders.get(this.ParentDirectoryId);
        this.Directories.push({
            Name: parentDirectory.data.name,
            Id: this.ParentDirectoryId,
            TokenCount: 0
        });

        const currentDirectory = super._inferCurrentDirectory(this.TargetDirectory.target);
        currentDirectory[1] = this.TargetDirectory.target;  // _inferCurrentDirectory wants to remove the last folder in the hierachy. Doing this probably breaks for some cases, possibly for s3 storage but I'm not really sure how all that works.

        await this._browseInternal(
            currentDirectory[0],
            currentDirectory[1]
        );

        // Populate set with existing actor names
        if(dontCreateDuplicate){
            for(let entity of game.actors.entities){
                actorSet.add(entity.data.name.toUpperCase());
            }
        }

        ui.notifications.info('[Actor Import] Starting');

        let index = 0;
        for (const directory of this.Directories.filter(d => d.TokenCount > 0)) {
            if (directory.Id === null || directory.Id === undefined) {
                const createdFolder = await Folder.create({
                    name: directory.Name,
                    parent: this.ParentDirectoryId,
                    type: "Actor"
                });

                directory.Id = createdFolder.data._id;
                index++;
                if (index % 100 === 0) {
                    ui.notifications.info(`[Actor Import] Status: ${index} folders created`);
                }
            }
        }

        index = 0;
        for (const file of this.Files) {
            let dirIndex = this._getDirectoryIndex(file.Parent);
            const actorName = decodeURIComponent(file.Name);
            const actorNameUpper = actorName.toUpperCase();
            dirIndex = dirIndex < 0 ? 0 : dirIndex;
            if(dontCreateDuplicate && actorSet.has(actorNameUpper)){
                continue;
            }
            else if(dontCreateDuplicate){
                actorSet.add(actorNameUpper);
            }

            await Actor.create({
                name: decodeURIComponent(file.Name),
                type: actorType,
                img: file.Path,
                folder: this.Directories[dirIndex].Id
            })

            index++;
            if (index % 100 === 0) {
                ui.notifications.info(`[Actor Import] Status: ${index} actors created`);
            }
        }

        ui.notifications.info(`[Actor Import] Complete. Imported ${index} actors.`);

        // clear temp storage
        this.Directories = null;
        this.Files = null;
    }

    /**
     * 
     * @param {*} base Base data source
     * @param {*} target Target directory to browse
     */
    async _browseInternal(base, target) {
        let currentBrowseResult = await FilePicker.browse(base, target);

        for (const dir of currentBrowseResult.dirs) {
            const dirName = dir.split('/').pop();
            const dirIndex = this._getDirectoryIndex(dirName);
            if (dirIndex < 0) {
                this.Directories.push({
                    Name: dirName,
                    Id: null,
                    TokenCount: 0
                });
            }

            /* Browse current directory */
            await this._browseInternal(base, dir);
        }

        const fileParent = target.split('/').pop();
        for (const file of currentBrowseResult.files) {
            const fileLower = file.toLowerCase();
            if (fileLower.endsWith('.jpg') || fileLower.endsWith('.png') || fileLower.endsWith('.svg')) {
                const fileName = file.split('/').pop();
                this.Files.push({
                    Name: fileName.substring(0, fileName.lastIndexOf('.')),
                    Parent: fileParent,
                    Path: file
                });

                let dirIndex = this._getDirectoryIndex(fileParent);
                dirIndex = dirIndex < 0 ? 0 : dirIndex;
                this.Directories[dirIndex].TokenCount++;
            }
        }
    }

    _getDirectoryIndex(name) {
        name = name.toLowerCase();
        return this.Directories.findIndex(d => d.Name.toLowerCase() === name);
    }
}

/**
 * Create ActorImporter
 */
Hooks.on('init', () => {
    // TODO has permission?
    new ActorImporter({ type: "directory" });
});
